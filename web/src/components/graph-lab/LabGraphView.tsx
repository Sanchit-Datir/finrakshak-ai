import type { GraphEdge, GraphNodeKind } from '@finrakshak-ai/shared';
import {
  Briefcase,
  Building,
  Calculator,
  Factory,
  Gavel,
  Landmark,
  MapPin,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { EDGE_LABEL, KIND_LABEL, type LabLayout, type PlacedNode } from '../../lib/graph-lab.js';
import { cn } from '../ui/cn.js';

export const KIND_ICON: Record<GraphNodeKind, LucideIcon> = {
  company: Factory,
  bank: Landmark,
  llp: Briefcase,
  audit_firm: Calculator,
  other_org: Building,
  person: UserRound,
  address: MapPin,
  event: Gavel,
};

/** Above this many highlighted links, captions are left to the side list. */
const EDGE_CAPTION_MAX = 10;

/** Solid = established & strong; dashed = weak (hub route, professional); dotted = candidate. */
function dash(e: GraphEdge): string | undefined {
  if (e.basis === 'candidate') return '2 5';
  return e.strength === 'weak' ? '7 5' : undefined;
}

function LegendLine({
  dasharray,
  label,
}: {
  dasharray?: string;
  label: string;
}): React.JSX.Element {
  return (
    <li className="flex items-center gap-2">
      <svg width="26" height="6" aria-hidden>
        <line
          x1="0"
          y1="3"
          x2="26"
          y2="3"
          stroke="var(--color-muted)"
          strokeWidth="2"
          strokeDasharray={dasharray}
        />
      </svg>
      {label}
    </li>
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Caption drawn along its line and kept upright, so captions of a fan of links do not collide. */
function EdgeCaption({ a, b, text }: { a: Point; b: Point; text: string }): React.JSX.Element {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const upright = deg > 90 || deg < -90 ? deg + 180 : deg;
  return (
    <text
      transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${upright})`}
      y={-5}
      textAnchor="middle"
      fontSize="11"
      fill="var(--color-ink)"
      paintOrder="stroke"
      stroke="var(--color-surface-2)"
      strokeWidth="4"
    >
      {text}
    </text>
  );
}

/** Names point away from the centre (beside, above or below the node) so they avoid the links. */
function namePlacement(p: PlacedNode): Point & { anchor: 'start' | 'middle' | 'end' } {
  if (p.depth === 0) return { x: 0, y: 44, anchor: 'middle' };
  if (Math.abs(p.x) > Math.abs(p.y) * 1.2)
    return p.x > 0 ? { x: 28, y: 4, anchor: 'start' } : { x: -28, y: 4, anchor: 'end' };
  return p.y < 0 ? { x: 0, y: -30, anchor: 'middle' } : { x: 0, y: 38, anchor: 'middle' };
}

export function LabGraphView({
  layout,
  selected,
  onSelect,
  label,
}: {
  layout: LabLayout;
  selected: string | null;
  onSelect: (id: string) => void;
  label: string;
}): React.JSX.Element {
  const pos = new Map(layout.nodes.map((n) => [n.node.id, n]));
  // Room for names beside the outermost nodes (labelled views) and for the legend below.
  const ex = Math.max(320, ...layout.nodes.map((n) => Math.abs(n.x) + (layout.busy ? 70 : 210)));
  const ey = Math.max(200, ex * 0.55, ...layout.nodes.map((n) => Math.abs(n.y) + 90));
  const isHot = (e: GraphEdge): boolean =>
    selected !== null && (e.from === selected || e.to === selected);
  // Edge captions overlap past a handful of links; the side list carries them as text.
  const captionEdges = layout.edges.filter(isHot).length <= EDGE_CAPTION_MAX;
  return (
    <div className="border-line bg-surface-2 relative overflow-hidden rounded-xl border">
      <svg
        viewBox={`${-ex} ${-ey} ${ex * 2} ${ey * 2}`}
        className="block h-[460px] w-full select-none lg:h-[560px]"
        role="group"
        aria-label={`${label}: ${layout.nodes.length} nodes, ${layout.edges.length} links. The relationships list beside the graph shows the same links as text.`}
      >
        {layout.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (a === undefined || b === undefined) return null;
          const hot = isHot(e);
          return (
            <g key={e.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={hot ? 'var(--color-primary)' : 'var(--color-muted)'}
                strokeWidth={hot ? 2.5 : 1.4}
                strokeDasharray={dash(e)}
                opacity={selected === null || hot ? 1 : 0.35}
              />
              {hot && captionEdges && <EdgeCaption a={a} b={b} text={EDGE_LABEL[e.type]} />}
            </g>
          );
        })}
        {layout.nodes.map((p) => {
          const { node, x, y, depth } = p;
          const Icon = KIND_ICON[node.kind];
          const isSel = node.id === selected;
          const isRoot = depth === 0;
          const showName = !layout.busy || isSel || isRoot;
          const name = namePlacement(p);
          return (
            <g
              key={node.id}
              transform={`translate(${x} ${y})`}
              tabIndex={0}
              role="button"
              aria-pressed={isSel}
              aria-label={`${node.label}, ${KIND_LABEL[node.kind]}${node.hub ? ', hub' : ''}`}
              onClick={() => {
                onSelect(node.id);
              }}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  onSelect(node.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[var(--color-primary)] [&:focus-visible>circle]:stroke-[4px]"
            >
              <title>{node.label}</title>
              <circle
                r={isRoot ? 28 : 22}
                fill={isRoot ? 'var(--color-navy)' : 'var(--color-surface)'}
                stroke={
                  isSel
                    ? 'var(--color-primary)'
                    : node.hub
                      ? 'var(--color-warn)'
                      : 'var(--color-line)'
                }
                strokeWidth={isSel ? 3 : node.hub ? 2.5 : 1.5}
                strokeDasharray={node.hub ? '4 3' : undefined}
              />
              <foreignObject x={-10} y={-10} width={20} height={20} pointerEvents="none">
                <Icon className={cn('size-5', isRoot ? 'text-white' : 'text-ink')} aria-hidden />
              </foreignObject>
              {showName && (
                <text
                  x={name.x}
                  y={name.y}
                  textAnchor={name.anchor}
                  fontSize="12"
                  fontWeight={isSel || isRoot ? 600 : 400}
                  fill="var(--color-ink)"
                  paintOrder="stroke"
                  stroke="var(--color-surface-2)"
                  strokeWidth="4"
                >
                  {node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul
        className="bg-surface/90 border-line absolute bottom-2 left-2 space-y-0.5 rounded-lg border px-2.5 py-1.5 text-[11px]"
        aria-label="Line legend"
      >
        <LegendLine label="Established record (used to find networks)" />
        <LegendLine dasharray="7 5" label="Weak: hub route or routine professional link" />
        <LegendLine dasharray="2 5" label="Candidate: text mention or possible same entity" />
        <li className="flex items-center gap-2">
          <svg width="26" height="14" aria-hidden>
            <circle
              cx="13"
              cy="7"
              r="6"
              fill="none"
              stroke="var(--color-warn)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          Hub (connects too many to be specific)
        </li>
      </ul>
    </div>
  );
}
