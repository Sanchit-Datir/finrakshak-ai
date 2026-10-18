import type {
  GraphEdge,
  GraphEdgeType,
  Relationship,
  RelationshipType,
} from '@finrakshak-ai/shared';

/** Transparent hub thresholds: above these, a connector says nothing specific. */
export const THRESHOLDS = {
  /** An event naming more parties than this is a batch notice (e.g. RBI cancels 54 NBFCs). */
  event_party_hub: 6,
  /** A creditor filing against more debtors than this is a common lender (e.g. a large bank). */
  creditor_hub: 5,
  /** A professional serving more companies than this is routine practice. */
  person_hub: 5,
  /** More entities than this at one address suggests a service address. */
  address_hub: 10,
  max_path_hops: 6,
} as const;

const TYPE_MAP: Readonly<Partial<Record<RelationshipType, GraphEdgeType>>> = {
  INSOLVENCY_APPLICANT_AGAINST: 'insolvency_applicant_against',
  INSOLVENCY_PROFESSIONAL_FOR: 'insolvency_professional_for',
  AUDITOR_OF: 'auditor_of',
  AUDIT_PARTNER_FOR: 'audit_partner_for',
  REGISTERED_AT: 'registered_at',
};

/** Edge types that never chain a network, whatever the hub status. */
const ALWAYS_WEAK = new Set<GraphEdgeType>([
  'mentioned_in',
  'insolvency_professional_for',
  'possible_same_entity',
]);

function edgeType(r: Relationship): GraphEdgeType | null {
  if (r.relationship_type === 'NAMED_IN_PROCEEDING') {
    return r.evidence_status === 'inference' ? 'mentioned_in' : 'named_in';
  }
  return TYPE_MAP[r.relationship_type] ?? null; // CO_MENTIONED_WITH is implied by mentioned_in
}

/** Maps source relationships to edges; strength is assigned later, once hubs are known. */
export function relationshipEdges(
  rels: readonly Relationship[],
  known: ReadonlySet<string>,
): GraphEdge[] {
  const out: GraphEdge[] = [];
  for (const r of rels) {
    const type = edgeType(r);
    if (type === null || !known.has(r.from_id) || !known.has(r.to_id)) continue;
    out.push({
      id: `edg_${r.relationship_id}`,
      from: r.from_id,
      to: r.to_id,
      type,
      basis: type === 'mentioned_in' ? 'candidate' : 'established',
      strength: 'strong',
      evidence_status: r.evidence_status,
      source_id: r.source_id,
      date: r.valid_from,
      document_id: r.document_id,
      relationship_id: r.relationship_id,
      confidence: r.confidence,
    });
  }
  return out;
}

export type HubRole = 'event' | 'creditor' | 'person' | 'auditor' | 'address';

/** The node acting as connector for an edge, and the role it plays there. */
function connector(e: GraphEdge): readonly [HubRole, string] | null {
  switch (e.type) {
    case 'named_in':
      return ['event', e.to];
    case 'insolvency_applicant_against':
      return ['creditor', e.from];
    case 'insolvency_professional_for':
    case 'audit_partner_for':
      return ['person', e.from];
    case 'auditor_of':
      return ['auditor', e.from];
    case 'registered_at':
      return ['address', e.to];
    case 'mentioned_in':
    case 'possible_same_entity':
      return null;
  }
}

const HUB_LIMIT: Readonly<Record<HubRole, number>> = {
  event: THRESHOLDS.event_party_hub,
  creditor: THRESHOLDS.creditor_hub,
  person: THRESHOLDS.person_hub,
  auditor: THRESHOLDS.person_hub,
  address: THRESHOLDS.address_hub,
};

/**
 * Hubs per role: a large bank is a hub *as a creditor* (its creditor edges stop chaining
 * networks) but its own regulatory events still count.
 */
export function findHubs(edges: readonly GraphEdge[]): Map<HubRole, Set<string>> {
  const count = new Map<HubRole, Map<string, number>>();
  for (const e of edges) {
    const c = connector(e);
    if (c === null) continue;
    const byId = count.get(c[0]) ?? new Map<string, number>();
    byId.set(c[1], (byId.get(c[1]) ?? 0) + 1);
    count.set(c[0], byId);
  }
  const hubs = new Map<HubRole, Set<string>>();
  for (const [role, byId] of count) {
    const ids = [...byId].filter(([, n]) => n > HUB_LIMIT[role]).map(([id]) => id);
    hubs.set(role, new Set(ids));
  }
  return hubs;
}

export function isHubEdge(e: GraphEdge, hubs: ReadonlyMap<HubRole, ReadonlySet<string>>): boolean {
  const c = connector(e);
  return c !== null && (hubs.get(c[0])?.has(c[1]) ?? false);
}

/**
 * Regulators and government bodies file insolvency applications in their regulatory role
 * (e.g. RBI for DHFL, Srei, Reliance Capital); that must not chain those debtors together.
 */
const REGULATOR =
  /^(the\s+)?(reserve bank of india|securities and exchange board|insolvency and bankruptcy board|registrar of companies|union of india|government of|state of|ministry of|directorate of|income tax|commissioner|central bureau|serious fraud investigation)/i;

export function regulatorIds(
  entities: readonly { entity_id: string; canonical_name: string; entity_type: string }[],
): Set<string> {
  return new Set(
    entities
      .filter((e) => e.entity_type === 'government_body' || REGULATOR.test(e.canonical_name))
      .map((e) => e.entity_id),
  );
}

/** Weak = shown, never used to chain networks: always-weak types, hub routes and regulator applicants. */
export function withStrength(
  edges: readonly GraphEdge[],
  hubs: ReadonlyMap<HubRole, ReadonlySet<string>>,
  regulators: ReadonlySet<string>,
): GraphEdge[] {
  return edges.map((e) => {
    const regulatorApplicant = e.type === 'insolvency_applicant_against' && regulators.has(e.from);
    const weak = ALWAYS_WEAK.has(e.type) || isHubEdge(e, hubs) || regulatorApplicant;
    return { ...e, strength: weak ? 'weak' : 'strong' };
  });
}
