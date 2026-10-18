import {
  buildAdjacency,
  shortestPath,
  type GraphLabBundle,
  type GraphNode,
  type PathStep,
} from '@finrakshak-ai/shared';
import { THRESHOLDS } from './edges.js';
import { isOrg } from './networks.js';

export interface SeedLink {
  readonly network_id: string;
  readonly cases: string[];
  readonly path: string[];
}

export interface Insights {
  readonly topHubs: { label: string; kind: string; degree: number }[];
  readonly seedLinks: SeedLink[];
  readonly sharedAddressGroups: number;
  readonly specificCreditorLinks: number;
  readonly sameCaseEvents: number;
  readonly networkSizes: Record<string, number>;
}

/** Each step printed in the edge's own direction, so "A —auditor of→ B" always reads correctly. */
function pathText(steps: readonly PathStep[], label: (id: string) => string): string[] {
  return steps.map(
    (s) => `${label(s.edge.from)} —${s.edge.type.replace(/_/g, ' ')}→ ${label(s.edge.to)}`,
  );
}

/**
 * Name used in written reports. Registered addresses are masked (B-38: small companies' offices
 * are often residences); the local viewer still shows them for review.
 */
function reportLabel(n: GraphNode | undefined): string | undefined {
  if (n?.kind === 'address')
    return `[shared registered address, ${n.detail ?? 'state not stated'}]`;
  return n?.label.slice(0, 70);
}

/** For each network touching two or more seed cases, one shortest evidence path between them. */
function seedLinks(b: GraphLabBundle, byId: ReadonlyMap<string, GraphNode>): SeedLink[] {
  const adj = buildAdjacency(b.edges, { includeWeak: false });
  const label = (id: string): string => reportLabel(byId.get(id)) ?? id;
  const out: SeedLink[] = [];
  for (const net of b.networks.filter((n) => n.seed_cases.length >= 2)) {
    const seeds = net.node_ids
      .map((id) => byId.get(id))
      .filter((n): n is GraphNode => n !== undefined && n.seed_cases.length > 0);
    const a = seeds[0];
    const z = seeds.find(
      (s) => a !== undefined && !s.seed_cases.some((c) => a.seed_cases.includes(c)),
    );
    if (a === undefined || z === undefined) continue;
    const steps = shortestPath(adj, a.id, z.id, THRESHOLDS.max_path_hops * 2) ?? [];
    out.push({ network_id: net.id, cases: net.seed_cases, path: pathText(steps, label) });
  }
  return out;
}

function sizeBuckets(b: GraphLabBundle): Record<string, number> {
  const out: Record<string, number> = { '2': 0, '3-5': 0, '6-20': 0, '21+': 0 };
  for (const n of b.networks) {
    const k =
      n.organisation_count === 2
        ? '2'
        : n.organisation_count <= 5
          ? '3-5'
          : n.organisation_count <= 20
            ? '6-20'
            : '21+';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function computeInsights(b: GraphLabBundle): Insights {
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  const strong = b.edges.filter((e) => e.strength === 'strong');
  const addr = new Map<string, number>();
  for (const e of strong.filter((x) => x.type === 'registered_at'))
    addr.set(e.to, (addr.get(e.to) ?? 0) + 1);
  const evParties = new Map<string, number>();
  for (const e of strong.filter((x) => x.type === 'named_in'))
    evParties.set(e.to, (evParties.get(e.to) ?? 0) + 1);
  return {
    topHubs: b.nodes
      .filter((n) => n.hub)
      .sort((x, y) => y.degree - x.degree)
      .slice(0, 12)
      .map((n) => ({ label: n.label.slice(0, 80), kind: n.kind, degree: n.degree })),
    seedLinks: seedLinks(b, byId),
    sharedAddressGroups: [...addr.values()].filter((n) => n >= 2).length,
    specificCreditorLinks: strong.filter((e) => {
      const from = byId.get(e.from);
      return e.type === 'insolvency_applicant_against' && from !== undefined && isOrg(from);
    }).length,
    sameCaseEvents: [...evParties.values()].filter((n) => n >= 2).length,
    networkSizes: sizeBuckets(b),
  };
}
