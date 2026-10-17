import type { CaseEvent, Entity, GraphEdge, GraphNode, GraphNodeKind } from '@fund-tracker/shared';
import { matchSeeds } from '../select/relevance.js';
import type { GraphInput } from './input.js';

/** Case types that are routine or informational, not adverse actions against the party. */
export const NON_ADVERSE_CASE_TYPES = new Set([
  'ibbi_voluntary_liquidation',
  'nfra_order_erratum',
  'nfra_inspection_report',
  'rbi_section_35a_update',
  'rbi_press_release',
  'sfio_notice',
  'other',
]);

function orgKind(e: Entity): GraphNodeKind {
  switch (e.entity_type) {
    case 'company':
    case 'bank':
    case 'llp':
    case 'audit_firm':
      return e.entity_type;
    case 'nbfc':
    case 'government_body':
    case 'other_org':
      return 'other_org';
  }
}

const base = {
  date: null,
  document_id: null,
  evidence_status: null,
  adverse_events: 0,
  seed_cases: [],
  hub: false,
  hub_roles: [],
  degree: 0,
};

function orgNode(e: Entity): GraphNode {
  const detail = [e.cin, e.status].filter((x): x is string => x !== null).join(' · ');
  const seeds = matchSeeds([e.canonical_name, ...e.aliases].join(' | ')).map((m) => m.case_id);
  return {
    ...base,
    id: e.entity_id,
    kind: orgKind(e),
    label: e.canonical_name,
    detail: detail || null,
    sources: [...e.sources],
    seed_cases: seeds,
  };
}

function eventNode(ev: CaseEvent): GraphNode {
  return {
    ...base,
    id: ev.event_id,
    kind: 'event',
    label: ev.title.slice(0, 220),
    detail: `${ev.authority} · ${ev.proceeding_status.replace(/_/g, ' ')} · ${ev.case_type}`,
    sources: [ev.source_id],
    date: ev.publication_date,
    document_id: ev.document_id,
  };
}

export function baseNodes(input: GraphInput): GraphNode[] {
  return [
    ...input.entities.map(orgNode),
    ...input.persons.map((p): GraphNode => ({
      ...base,
      id: p.person_id,
      kind: 'person',
      label: p.name,
      detail: p.roles.join(', ').replace(/_/g, ' '),
      sources: [...p.sources],
    })),
    ...input.addresses.map((a): GraphNode => ({
      ...base,
      id: a.address_id,
      kind: 'address',
      label: a.raw_address.slice(0, 160),
      detail: a.state,
      sources: ['mca_ogd'],
    })),
    ...input.events.map(eventNode),
  ];
}

/** Adds degree, hub flag and the number of distinct adverse events an organisation is named in. */
export function annotateNodes(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  hubs: ReadonlyMap<string, ReadonlySet<string>>,
  events: readonly CaseEvent[],
): GraphNode[] {
  const degree = new Map<string, number>();
  const adverse = new Map<string, Set<string>>();
  const caseType = new Map(events.map((e) => [e.event_id, e.case_type]));
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    if (e.type !== 'named_in' || NON_ADVERSE_CASE_TYPES.has(caseType.get(e.to) ?? 'other'))
      continue;
    adverse.set(e.from, (adverse.get(e.from) ?? new Set()).add(e.to));
  }
  return nodes.map((n) => ({
    ...n,
    degree: degree.get(n.id) ?? 0,
    hub: [...hubs.values()].some((ids) => ids.has(n.id)),
    hub_roles: [...hubs].filter(([, ids]) => ids.has(n.id)).map(([role]) => role),
    adverse_events: adverse.get(n.id)?.size ?? 0,
  }));
}
