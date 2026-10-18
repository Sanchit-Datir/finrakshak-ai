import {
  Building2,
  FileText,
  Gavel,
  Landmark,
  LocateFixed,
  Maximize2,
  Network,
  Plus,
  RotateCcw,
  Table2,
  UserRound,
  Wallet,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ENTITY_KIND_LABEL } from '../../domain/labels.js';
import type { Db, EntityKind, LinkStatus } from '../../domain/schemas.js';
import { layoutGraph, neighbours } from '../../lib/graph.js';
import { matchesQuery } from '../../lib/text.js';
import { useFormat } from '../../state/hooks.js';
import { Button, IconButton } from '../ui/Button.js';
import { Checkbox } from '../ui/Field.js';
import { SearchInput } from '../ui/SearchInput.js';
import { EmptyState, Notice } from '../ui/States.js';
import { LinkStatusBadge } from '../ui/StatusBadges.js';
import { cn } from '../ui/cn.js';
import { EdgeTable } from './EdgeTable.js';

const KIND_ICON: Record<EntityKind, LucideIcon> = {
  individual: UserRound,
  company: Building2,
  account: Wallet,
  loan: Landmark,
  document: FileText,
  proceeding: Gavel,
  counterparty: Wallet,
};

const DASH: Record<LinkStatus, string | undefined> = {
  verified: undefined,
  user_provided: '7 5',
  inferred: '2 5',
};

/**
 * Reusable relationship graph (spec §12). Shows only recorded relationships and
 * observed transfers, expands one level at a time, and has a table alternative.
 */
export function EntityGraph({
  db,
  roots,
  title = 'Related entities',
}: {
  db: Db;
  roots: string[];
  title?: string;
}): React.JSX.Element {
  const f = useFormat();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots));
  const [transfers, setTransfers] = useState(true);
  const [selected, setSelected] = useState<string | null>(roots[0] ?? null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [asTable, setAsTable] = useState(false);
  const [q, setQ] = useState('');
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const layout = useMemo(
    () => layoutGraph(db, roots, expanded, transfers),
    [db, roots, expanded, transfers],
  );
  const pos = new Map(layout.nodes.map((n) => [n.entity.id, n]));
  const sel = selected === null ? undefined : pos.get(selected);
  const selEdges =
    selected === null ? [] : layout.edges.filter((e) => e.from === selected || e.to === selected);
  const hiddenCount =
    selected === null
      ? 0
      : neighbours(db, selected, transfers).filter(
          (e) => !pos.has(e.from === selected ? e.to : e.from),
        ).length;
  const name = (id: string): string =>
    pos.get(id)?.entity.name ?? db.entities.find((e) => e.id === id)?.name ?? id;

  // Fit the drawing to a wide (≈16:9) viewport so nodes stay legible.
  const ex = Math.max(320, ...layout.nodes.map((n) => Math.abs(n.x) + 140));
  const ey = Math.max(180, ex * 0.5, ...layout.nodes.map((n) => Math.abs(n.y) + 70));
  const size = (ex * 2) / view.k;
  const h = (ey * 2) / view.k;
  const viewBox = `${-size / 2 - view.x} ${-h / 2 - view.y} ${size} ${h}`;

  const onDown = (e: PointerEvent<SVGSVGElement>): void => {
    if ((e.target as Element).closest('[data-node]') !== null) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (d === null) return;
    const scale = size / e.currentTarget.getBoundingClientRect().width;
    setView((v) => ({
      ...v,
      x: d.vx + (e.clientX - d.x) * scale,
      y: d.vy + (e.clientY - d.y) * scale,
    }));
  };
  const search = (v: string): void => {
    setQ(v);
    const hit = layout.nodes.find(
      (n) => v.trim().length >= 2 && matchesQuery(v, n.entity.name, n.entity.subtitle),
    );
    if (hit !== undefined) {
      setSelected(hit.entity.id);
      setView((cur) => ({ ...cur, x: -hit.x, y: -hit.y }));
    }
  };

  if (layout.edges.length === 0) {
    return (
      <EmptyState icon={Network} title="No related entities found">
        No related entities were found in available records. This does not prove no relationship
        exists.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <SearchInput
          label="Find in graph"
          value={q}
          onChange={search}
          placeholder="Entity name…"
          className="w-full sm:w-60"
        />
        <Checkbox
          label="Include observed fund transfers"
          checked={transfers}
          onChange={(e) => {
            setTransfers(e.target.checked);
          }}
          className="pb-2"
        />
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Zoom in"
            icon={ZoomIn}
            onClick={() => {
              setView((v) => ({ ...v, k: Math.min(3, v.k * 1.25) }));
            }}
          />
          <IconButton
            label="Zoom out"
            icon={ZoomOut}
            onClick={() => {
              setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.25) }));
            }}
          />
          <IconButton
            label="Fit to screen"
            icon={Maximize2}
            onClick={() => {
              setView({ x: 0, y: 0, k: 1 });
            }}
          />
          <IconButton
            label="Centre on selected"
            icon={LocateFixed}
            disabled={sel === undefined}
            onClick={() => {
              if (sel !== undefined) setView((v) => ({ ...v, x: -sel.x, y: -sel.y }));
            }}
          />
          <IconButton
            label="Reset graph"
            icon={RotateCcw}
            onClick={() => {
              setExpanded(new Set(roots));
              setView({ x: 0, y: 0, k: 1 });
              setSelected(roots[0] ?? null);
            }}
          />
          <Button
            size="sm"
            variant={asTable ? 'subtle' : 'secondary'}
            icon={Table2}
            aria-pressed={asTable}
            onClick={() => {
              setAsTable((t) => !t);
            }}
          >
            Table view
          </Button>
        </div>
      </div>

      {asTable ? (
        <EdgeTable edges={layout.edges} name={name} date={f.date} caption={title} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="border-line bg-surface-2 relative overflow-hidden rounded-xl border">
            <svg
              viewBox={viewBox}
              className="block h-[440px] w-full touch-none cursor-grab select-none"
              role="group"
              aria-label={`${title}: ${layout.nodes.length} entities, ${layout.edges.length} links. Use the table view for a full list.`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0L10 5L0 10z" fill="var(--color-muted)" />
                </marker>
              </defs>
              {layout.edges.map((e) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (a === undefined || b === undefined) return null;
                const hot = selected !== null && (e.from === selected || e.to === selected);
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const ex = b.x - (dx / len) * 30;
                const ey = b.y - (dy / len) * 30;
                return (
                  <g key={e.id}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={ex}
                      y2={ey}
                      stroke={
                        e.kind === 'transfer'
                          ? 'var(--color-teal)'
                          : hot
                            ? 'var(--color-primary)'
                            : 'var(--color-muted)'
                      }
                      strokeWidth={hot ? 2.5 : 1.5}
                      strokeDasharray={DASH[e.status]}
                      markerEnd={e.kind === 'transfer' ? 'url(#arrow)' : undefined}
                      opacity={selected === null || hot ? 1 : 0.35}
                    />
                    {hot && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 6}
                        textAnchor="middle"
                        fontSize="11"
                        fill="var(--color-ink)"
                        paintOrder="stroke"
                        stroke="var(--color-surface-2)"
                        strokeWidth="4"
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {layout.nodes.map((n) => {
                const Icon = KIND_ICON[n.entity.kind];
                const isSel = n.entity.id === selected;
                const isRoot = n.depth === 0;
                return (
                  <g
                    key={n.entity.id}
                    data-node
                    transform={`translate(${n.x} ${n.y})`}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSel}
                    aria-label={`${n.entity.name}, ${ENTITY_KIND_LABEL[n.entity.kind]}`}
                    onClick={() => {
                      setSelected(n.entity.id);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        setSelected(n.entity.id);
                      }
                    }}
                    className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[var(--color-primary)] [&:focus-visible>circle]:stroke-[4px]"
                  >
                    <circle
                      r={isRoot ? 30 : 24}
                      fill={isRoot ? 'var(--color-navy)' : 'var(--color-surface)'}
                      stroke={isSel ? 'var(--color-primary)' : 'var(--color-line)'}
                      strokeWidth={isSel ? 3 : 1.5}
                    />
                    <foreignObject x={-10} y={-10} width={20} height={20} pointerEvents="none">
                      <Icon
                        className={cn('size-5', isRoot ? 'text-white' : 'text-ink')}
                        aria-hidden
                      />
                    </foreignObject>
                    <text
                      y={isRoot ? 46 : 40}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight={isSel || isRoot ? 600 : 400}
                      fill="var(--color-ink)"
                      paintOrder="stroke"
                      stroke="var(--color-surface-2)"
                      strokeWidth="4"
                    >
                      {n.entity.name.length > 26 ? `${n.entity.name.slice(0, 25)}…` : n.entity.name}
                    </text>
                    {!expanded.has(n.entity.id) &&
                      neighbours(db, n.entity.id, transfers).length > 0 && (
                        <g transform={`translate(${isRoot ? 22 : 18} ${isRoot ? -22 : -18})`}>
                          <circle r="8" fill="var(--color-primary)" />
                          <text
                            y="3.5"
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="#fff"
                          >
                            +
                          </text>
                        </g>
                      )}
                  </g>
                );
              })}
            </svg>
            <ul
              className="bg-surface/90 border-line absolute bottom-2 left-2 space-y-0.5 rounded-lg border px-2.5 py-1.5 text-[11px]"
              aria-label="Line legend"
            >
              <li className="flex items-center gap-2">
                <svg width="26" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-muted)" strokeWidth="2" />
                </svg>
                Verified from document / record
              </li>
              <li className="flex items-center gap-2">
                <svg width="26" height="6" aria-hidden>
                  <line
                    x1="0"
                    y1="3"
                    x2="26"
                    y2="3"
                    stroke="var(--color-muted)"
                    strokeWidth="2"
                    strokeDasharray="7 5"
                  />
                </svg>
                User-provided
              </li>
              <li className="flex items-center gap-2">
                <svg width="26" height="6" aria-hidden>
                  <line
                    x1="0"
                    y1="3"
                    x2="26"
                    y2="3"
                    stroke="var(--color-muted)"
                    strokeWidth="2"
                    strokeDasharray="2 5"
                  />
                </svg>
                Inferred / possible match
              </li>
              <li className="flex items-center gap-2">
                <svg width="26" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-teal)" strokeWidth="2" />
                </svg>
                Observed fund transfer
              </li>
            </ul>
          </div>
          <aside className="border-line rounded-xl border p-3 text-sm" aria-live="polite">
            {sel === undefined ? (
              <p className="text-muted">Select an entity to see its relationships and evidence.</p>
            ) : (
              <>
                <p className="font-semibold">{sel.entity.name}</p>
                <p className="text-muted text-xs">
                  {ENTITY_KIND_LABEL[sel.entity.kind]} · {sel.entity.subtitle}
                </p>
                {hiddenCount > 0 && !expanded.has(sel.entity.id) && (
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={Plus}
                    className="mt-2"
                    onClick={() => {
                      setExpanded((s) => new Set([...s, sel.entity.id]));
                    }}
                  >
                    Expand one level ({hiddenCount})
                  </Button>
                )}
                <ul className="mt-3 max-h-[300px] space-y-2 overflow-y-auto">
                  {selEdges.map((e) => (
                    <li key={e.id} className="border-line rounded-lg border p-2">
                      <p className="text-[13px]">
                        <strong>{name(e.from)}</strong> — {e.label.toLowerCase()} —{' '}
                        <strong>{name(e.to)}</strong>
                      </p>
                      <div className="mt-1">
                        <LinkStatusBadge status={e.status} />
                      </div>
                      <p className="text-muted mt-1 text-xs">{e.evidence}</p>
                      <p className="text-muted text-xs">
                        Source: {e.source} · {f.date(e.observedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}
      <Notice>
        A relationship does not establish wrongdoing. Shared directors, addresses or counterparties
        are context for review, not evidence of misuse. Inferred links are possible matches only.
      </Notice>
    </div>
  );
}
