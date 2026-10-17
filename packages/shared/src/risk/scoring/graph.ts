import type { RecordKind } from '../recordKinds.js';
import type { FlaggedNeighbour } from '../patterns/timeline.js';
import { pointsShare } from './calc.js';
import type { ScoringLink } from './inputs.js';
import type { ScoringSettings } from './settings.js';
import type { LayerResult, Reason } from './types.js';

/**
 * Graph proximity layer (max 20): how close the borrower sits to an entity with an insolvency,
 * liquidation or enforcement record, through documented links. One hop 20, two hops 10, three or more
 * 0; half when the path has an inferred or user-provided link. Hubs never count and are never walked
 * through (B-40). The layer takes the closest neighbour, not the sum.
 */

type LinkStatus = FlaggedNeighbour['link_status'];
const STATUS_RANK: Readonly<Record<LinkStatus, number>> = {
  verified: 0,
  user_provided: 1,
  inferred: 2,
};
const asStatus = (s: string): LinkStatus =>
  s === 'verified' || s === 'user_provided' ? s : 'inferred';
const weaker = (a: LinkStatus, b: LinkStatus): LinkStatus =>
  STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;

/** `account_of` ties an account to its owner; it is bookkeeping, not a relationship. */
const IGNORED_LINK_TYPES = new Set(['account_of']);

function adjacency(
  links: readonly ScoringLink[],
): Map<string, { to: string; status: LinkStatus }[]> {
  const adj = new Map<string, { to: string; status: LinkStatus }[]>();
  const add = (a: string, b: string, status: LinkStatus): void => {
    const list = adj.get(a) ?? [];
    list.push({ to: b, status });
    adj.set(a, list);
  };
  for (const l of links) {
    if (IGNORED_LINK_TYPES.has(l.type) || l.from === l.to) continue;
    add(l.from, l.to, asStatus(l.status));
    add(l.to, l.from, asStatus(l.status));
  }
  return adj;
}

const isHub = (
  adj: ReadonlyMap<string, readonly { to: string }[]>,
  id: string,
  min: number,
): boolean => new Set((adj.get(id) ?? []).map((e) => e.to)).size >= min;

/**
 * Flagged entities within `maxHops` of the subject, each at its shortest distance and, among equally
 * short paths, its strongest link status (a path is as strong as its weakest link).
 */
export function flaggedNeighbours(
  subjectId: string,
  links: readonly ScoringLink[],
  flagged: ReadonlyMap<string, readonly RecordKind[]>,
  hubMinLinks: number,
  maxHops: 1 | 2 | 3 = 3,
): FlaggedNeighbour[] {
  const adj = adjacency(links);
  const best = new Map<string, { hops: 1 | 2 | 3; status: LinkStatus }>();
  let frontier: { id: string; status: LinkStatus }[] = [{ id: subjectId, status: 'verified' }];
  for (const hops of [1, 2, 3] as const) {
    if (hops > maxHops) break;
    const next = new Map<string, LinkStatus>();
    for (const { id, status } of frontier) {
      if (id !== subjectId && isHub(adj, id, hubMinLinks)) continue;
      for (const e of adj.get(id) ?? []) {
        if (e.to === subjectId || best.has(e.to)) continue;
        const s = weaker(status, e.status);
        const prev = next.get(e.to);
        if (prev === undefined || STATUS_RANK[s] < STATUS_RANK[prev]) next.set(e.to, s);
      }
    }
    for (const [id, status] of next) best.set(id, { hops, status });
    frontier = [...next].map(([id, status]) => ({ id, status }));
  }
  return [...best]
    .filter(([id]) => (flagged.get(id) ?? []).length > 0)
    .map(([id, b]) => ({
      entity_id: id,
      hops: b.hops,
      link_status: b.status,
      kinds: [...new Set(flagged.get(id) ?? [])].sort(),
      is_hub: isHub(adj, id, hubMinLinks),
    }))
    .sort((a, b) => a.hops - b.hops || a.entity_id.localeCompare(b.entity_id));
}

function neighbourReason(
  n: FlaggedNeighbour,
  subjectId: string,
  s: ScoringSettings['graph'],
): Reason | null {
  const base = n.hops === 1 ? s.one_hop : n.hops === 2 ? s.two_hops : 0;
  const pts = n.link_status === 'verified' ? base : pointsShare(base, s.unverified_link_percent);
  if (pts <= 0) return null;
  return {
    code: 'graph_proximity',
    layer: 'graph',
    reason_key: `graph_proximity|${n.entity_id}`,
    subject_id: subjectId,
    points: pts,
    evidence_ids: [n.entity_id],
    evidence_statuses: [n.link_status === 'verified' ? 'fact' : 'inference'],
    source: 'graph',
    facts: { hops: n.hops, link_status: n.link_status, kinds: n.kinds.join(',') },
    pattern: null,
  };
}

/**
 * Scores the neighbours. `alreadyScored` are entities the direct layer counted (directors and owners
 * with their own records), left out here so one record does not count twice.
 */
export function graphLayer(
  subjectId: string,
  neighbours: readonly FlaggedNeighbour[],
  alreadyScored: ReadonlySet<string>,
  settings: ScoringSettings,
): LayerResult {
  const reasons = neighbours
    .filter((n) => !n.is_hub && n.kinds.length > 0 && !alreadyScored.has(n.entity_id))
    .map((n) => neighbourReason(n, subjectId, settings.graph))
    .filter((r): r is Reason => r !== null);
  const top = Math.max(0, ...reasons.map((r) => r.points));
  return { points: Math.min(settings.layer_max.graph, top), reasons };
}
