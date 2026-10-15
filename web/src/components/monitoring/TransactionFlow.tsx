import { ArrowLeftRight, Banknote, Landmark, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Db, Loan, Transaction } from '../../domain/schemas.js';
import { formatMoney, formatMoneyCompact } from '../../lib/format.js';
import { useFormat } from '../../state/hooks.js';
import { EmptyState } from '../ui/States.js';
import { cn } from '../ui/cn.js';
import { entityLabel } from './AlertDrawer.js';

interface FlowNode {
  id: string;
  depth: number;
  row: number;
}
interface FlowEdge {
  from: string;
  to: string;
  total: number;
  txns: Transaction[];
}

const COL = 310;
const ROW = 92;

/** Builds the observed flow outward from the loan account, time-ordered, up to `maxDepth` hops. */
function buildFlow(
  loan: Loan,
  txns: Transaction[],
  maxDepth: number,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const root = `loan:${loan.id}`;
  const depth = new Map<string, number>([
    [root, 0],
    [loan.accountEntityId, 1],
  ]);
  const reachedAt = new Map<string, number>([
    [loan.accountEntityId, new Date(loan.disbursedAt).getTime()],
  ]);
  const sorted = [...txns].sort((a, b) => a.at.localeCompare(b.at));
  const used: Transaction[] = sorted.filter(
    (t) => t.fromId === root && t.toId === loan.accountEntityId,
  );
  for (const t of sorted) {
    if (t.fromId === root) continue;
    const d = depth.get(t.fromId);
    const since = reachedAt.get(t.fromId);
    if (
      d === undefined ||
      since === undefined ||
      d >= maxDepth + 1 ||
      new Date(t.at).getTime() < since
    )
      continue;
    used.push(t);
    if (!depth.has(t.toId)) {
      depth.set(t.toId, d + 1);
      reachedAt.set(t.toId, new Date(t.at).getTime());
    }
  }
  const edgeMap = new Map<string, FlowEdge>();
  for (const t of used) {
    const k = `${t.fromId}>${t.toId}`;
    const e = edgeMap.get(k) ?? { from: t.fromId, to: t.toId, total: 0, txns: [] };
    e.total += t.amountMinor;
    e.txns.push(t);
    edgeMap.set(k, e);
  }
  const rows = new Map<number, number>();
  const nodes: FlowNode[] = [...depth.entries()].map(([id, d]) => {
    const r = rows.get(d) ?? 0;
    rows.set(d, r + 1);
    return { id, depth: d, row: r };
  });
  return { nodes, edges: [...edgeMap.values()] };
}

export function TransactionFlow({
  db,
  loan,
  txns,
  highlight,
  maxDepth,
}: {
  db: Db;
  loan: Loan;
  txns: Transaction[];
  highlight: Set<string>;
  maxDepth: number;
}): React.JSX.Element {
  const f = useFormat();
  const { nodes, edges } = useMemo(() => buildFlow(loan, txns, maxDepth), [loan, txns, maxDepth]);
  const [selected, setSelected] = useState<string | null>(null);
  if (edges.length === 0)
    return (
      <EmptyState icon={ArrowLeftRight} title="No transaction records are available for this loan.">
        Import an authorised transaction file to analyse fund movement. Public records alone cannot
        establish a money trail.
      </EmptyState>
    );
  const maxRows = Math.max(
    ...[...new Set(nodes.map((n) => n.depth))].map(
      (d) => nodes.filter((n) => n.depth === d).length,
    ),
  );
  const width = (Math.max(...nodes.map((n) => n.depth)) + 1) * COL;
  const height = Math.max(1, maxRows) * ROW + 30;
  const pos = (n: FlowNode): { x: number; y: number } => {
    const count = nodes.filter((x) => x.depth === n.depth).length;
    return { x: n.depth * COL + 20, y: (height - count * ROW) / 2 + n.row * ROW + 10 };
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sel =
    selected === null ? [] : edges.filter((e) => e.from === selected || e.to === selected);
  const icon = (id: string): typeof Landmark =>
    id.startsWith('loan:') ? Landmark : id === 'x-cash' ? Banknote : UserRound;
  return (
    <div className="space-y-3">
      <div className="border-line bg-surface-2 overflow-x-auto rounded-xl border">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: Math.round(width * 0.8) }}
          role="group"
          aria-label={`Fund flow for ${loan.id}: ${nodes.length} parties, ${edges.length} transfer links. The transaction table below lists every record.`}
          className="block h-auto w-full"
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10z" fill="var(--color-muted)" />
            </marker>
            <marker
              id="flow-arrow-hot"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10z" fill="var(--color-danger)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (a === undefined || b === undefined) return null;
            const p = pos(a);
            const q = pos(b);
            const hot = e.txns.some((t) => highlight.has(t.id));
            const back = q.x <= p.x;
            const x1 = p.x + 170;
            const y1 = p.y + 28;
            const x2 = back ? q.x + 170 : q.x;
            const y2 = q.y + 28;
            const path = back
              ? `M${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 60} ${y2 + 40}, ${x2} ${y2}`
              : `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
            const first = e.txns[0];
            return (
              <g key={`${e.from}>${e.to}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={hot ? 'var(--color-danger)' : 'var(--color-muted)'}
                  strokeWidth={hot ? 2.5 : 1.5}
                  strokeDasharray={back ? '6 4' : undefined}
                  markerEnd={hot ? 'url(#flow-arrow-hot)' : 'url(#flow-arrow)'}
                  opacity={selected === null || e.from === selected || e.to === selected ? 1 : 0.3}
                />
                <text
                  x={(x1 + x2) / 2 + (back ? 40 : 0)}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--color-ink)"
                  paintOrder="stroke"
                  stroke="var(--color-surface-2)"
                  strokeWidth="4"
                  className="tabular"
                >
                  {formatMoneyCompact(e.total)}
                  {e.txns.length > 1 ? ` (${e.txns.length})` : ''}
                  {first !== undefined ? ` · ${f.date(first.at).slice(0, 6)}` : ''}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = pos(n);
            const Icon = icon(n.id);
            const isSel = selected === n.id;
            const name = n.id.startsWith('loan:') ? `Loan ${loan.id}` : entityLabel(db, n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${name}. ${edges.filter((e) => e.from === n.id || e.to === n.id).length} transfer link(s).`}
                onClick={() => {
                  setSelected(isSel ? null : n.id);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setSelected(isSel ? null : n.id);
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--color-primary)] [&:focus-visible>rect]:stroke-[3px]"
              >
                <rect
                  width="170"
                  height="56"
                  rx="10"
                  fill={n.depth <= 1 ? 'var(--color-navy)' : 'var(--color-surface)'}
                  stroke={isSel ? 'var(--color-primary)' : 'var(--color-line)'}
                  strokeWidth={isSel ? 2.5 : 1}
                />
                <foreignObject x="10" y="18" width="20" height="20" pointerEvents="none">
                  <Icon
                    className={cn('size-5', n.depth <= 1 ? 'text-white' : 'text-muted')}
                    aria-hidden
                  />
                </foreignObject>
                <foreignObject x="36" y="6" width="128" height="46" pointerEvents="none">
                  <p
                    className={cn(
                      'line-clamp-2 text-[11px] leading-tight font-semibold',
                      n.depth <= 1 ? 'text-white' : 'text-ink',
                    )}
                  >
                    {name}
                  </p>
                  <p className={cn('text-[10px]', n.depth <= 1 ? 'text-white/70' : 'text-muted')}>
                    {n.depth === 0
                      ? 'Disbursing loan'
                      : n.depth === 1
                        ? 'Borrower account (root)'
                        : `Hop ${n.depth - 1}`}
                  </p>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="border-line rounded-xl border p-3 text-sm" aria-live="polite">
        {selected === null ? (
          <p className="text-muted">
            Select a party to see the observed transfers in and out. Red links are part of the
            selected alert. Dashed links return to an earlier party.
          </p>
        ) : (
          <>
            <p className="font-semibold">
              {selected.startsWith('loan:') ? `Loan ${loan.id}` : entityLabel(db, selected)}
            </p>
            <ul className="mt-2 grid max-h-[320px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {sel
                .flatMap((e) => e.txns)
                .map((t) => (
                  <li key={t.id} className="border-line rounded-lg border p-2 text-xs">
                    <p className="tabular font-semibold">
                      {t.fromId === selected ? 'Out' : 'In'} · {formatMoney(t.amountMinor)}
                    </p>
                    <p className="text-muted">
                      {t.fromId === selected
                        ? `to ${entityLabel(db, t.toId)}`
                        : `from ${entityLabel(db, t.fromId)}`}
                    </p>
                    <p className="text-muted">
                      {f.dateTime(t.at)} · {t.id}
                    </p>
                  </li>
                ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
