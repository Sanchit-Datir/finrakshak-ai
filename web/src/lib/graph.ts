import { REL_LABEL } from '../domain/labels.js';
import type { Db, Entity, LinkStatus } from '../domain/schemas.js';
import { formatMoney } from './format.js';

/** Relationship graph assembled only from recorded relationships and observed transactions. */

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  status: LinkStatus;
  source: string;
  observedAt: string;
  evidence: string;
  kind: 'relationship' | 'transfer';
}

const cache = new WeakMap<Db, GraphEdge[]>();

/** All edges: recorded relationships plus fund transfers aggregated between account owners. */
export function allEdges(db: Db): GraphEdge[] {
  const hit = cache.get(db);
  if (hit !== undefined) return hit;
  const owner = new Map(db.entities.map((e) => [e.id, e.ownerId ?? e.id]));
  const edges: GraphEdge[] = db.relationships
    .filter((r) => r.type !== 'account_of')
    .map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      label: REL_LABEL[r.type],
      status: r.status,
      source: r.source,
      observedAt: r.observedAt,
      evidence: r.evidence,
      kind: 'relationship' as const,
    }));
  const flows = new Map<
    string,
    { from: string; to: string; total: number; ids: string[]; last: string }
  >();
  for (const t of db.transactions) {
    if (t.type === 'disbursement' || t.type === 'repayment' || t.type === 'cash_withdrawal')
      continue;
    const from = owner.get(t.fromId) ?? t.fromId;
    const to = owner.get(t.toId) ?? t.toId;
    if (from === to) continue;
    const key = `${from}>${to}`;
    const f = flows.get(key) ?? { from, to, total: 0, ids: [], last: t.at };
    f.total += t.amountMinor;
    f.ids.push(t.id);
    if (t.at > f.last) f.last = t.at;
    flows.set(key, f);
  }
  for (const [key, f] of flows) {
    edges.push({
      id: `flow:${key}`,
      from: f.from,
      to: f.to,
      label: 'Transferred funds to',
      status: 'verified',
      source: `Transaction records (${f.ids.join(', ')})`,
      observedAt: f.last,
      evidence: `${f.ids.length} transfer(s) totalling ${formatMoney(f.total)}`,
      kind: 'transfer',
    });
  }
  cache.set(db, edges);
  return edges;
}

export function neighbours(db: Db, entityId: string, includeTransfers: boolean): GraphEdge[] {
  return allEdges(db).filter(
    (e) =>
      (includeTransfers || e.kind === 'relationship') && (e.from === entityId || e.to === entityId),
  );
}

export interface Layout {
  nodes: { entity: Entity; x: number; y: number; depth: number }[];
  edges: GraphEdge[];
}

/** Radial layout: roots in the centre, each expansion level on an outer ring. */
export function layoutGraph(
  db: Db,
  roots: string[],
  expanded: Set<string>,
  includeTransfers: boolean,
): Layout {
  const byId = new Map(db.entities.map((e) => [e.id, e]));
  const depth = new Map<string, number>();
  for (const r of roots) if (byId.has(r)) depth.set(r, 0);
  const edges = new Map<string, GraphEdge>();
  let frontier = [...depth.keys()];
  for (let d = 0; d < 6 && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (!expanded.has(id)) continue;
      for (const e of neighbours(db, id, includeTransfers)) {
        edges.set(e.id, e);
        const other = e.from === id ? e.to : e.from;
        if (!depth.has(other) && byId.has(other)) {
          depth.set(other, d + 1);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  // Keep only edges whose ends are both visible.
  const visibleEdges = [...edges.values()].filter((e) => depth.has(e.from) && depth.has(e.to));
  const rings = new Map<number, string[]>();
  for (const [id, d] of depth) rings.set(d, [...(rings.get(d) ?? []), id]);
  const nodes: Layout['nodes'] = [];
  for (const [d, ids] of rings) {
    const radius = d === 0 ? (ids.length > 1 ? 80 : 0) : 40 + d * 150;
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2 + d * 0.35;
      const entity = byId.get(id);
      if (entity !== undefined)
        nodes.push({ entity, depth: d, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  }
  return { nodes, edges: visibleEdges };
}
