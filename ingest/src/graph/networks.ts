import {
  buildAdjacency,
  components,
  type GraphEdge,
  type GraphNetwork,
  type GraphNode,
  type GraphNodeKind,
} from '@fund-tracker/shared';
import { stableId } from '../util/ids.js';

const ORG_KINDS = new Set<GraphNodeKind>(['company', 'bank', 'llp', 'audit_firm', 'other_org']);

export const isOrg = (n: GraphNode): boolean => ORG_KINDS.has(n.kind);

/**
 * Transparent ranking (higher = more worth a human look, never "more suspicious"):
 * distinct sources + organisations named in adverse records + 3 × seed cases touched.
 */
export const SCORE_FORMULA =
  'score = distinct sources + organisations named in adverse records + 3 × seed cases';

function describe(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string {
  const orgs = nodes.filter(isOrg).length;
  const via = new Map<string, number>();
  for (const e of edges) via.set(e.type, (via.get(e.type) ?? 0) + 1);
  const parts = [...via]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`);
  return `${orgs} organisations connected by established records (${parts.join(', ')}). A connection is not evidence of wrongdoing.`;
}

/** Networks = connected components over strong edges that contain at least two organisations. */
export function findNetworks(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): GraphNetwork[] {
  const strong = edges.filter((e) => e.strength === 'strong');
  const adj = buildAdjacency(strong, { includeWeak: false });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: GraphNetwork[] = [];
  for (const ids of components(byId.keys(), adj)) {
    const members = ids.map((id) => byId.get(id)).filter((n): n is GraphNode => n !== undefined);
    const orgs = members.filter(isOrg);
    if (orgs.length < 2) continue;
    const set = new Set(ids);
    const inner = strong.filter((e) => set.has(e.from) && set.has(e.to));
    const sources = [...new Set(members.flatMap((m) => m.sources))].sort();
    const seeds = [...new Set(orgs.flatMap((o) => o.seed_cases))].sort();
    const adverse = orgs.filter((o) => o.adverse_events > 0).length;
    out.push({
      id: stableId('net', ...[...ids].sort()),
      node_ids: ids,
      organisation_count: orgs.length,
      adverse_organisation_count: adverse,
      sources,
      seed_cases: seeds,
      score: sources.length + adverse + 3 * seeds.length,
      summary: describe(members, inner),
    });
  }
  return out.sort((a, b) => b.score - a.score || b.organisation_count - a.organisation_count);
}
