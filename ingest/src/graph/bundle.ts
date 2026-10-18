import type {
  DocumentRecord,
  GraphDocument,
  GraphEdge,
  GraphLabBundle,
  GraphNode,
  IdentityCandidate,
} from '@finrakshak-ai/shared';
import { stableId } from '../util/ids.js';
import { findHubs, regulatorIds, relationshipEdges, THRESHOLDS, withStrength } from './edges.js';
import { identityCandidates } from './identity.js';
import type { GraphInput } from './input.js';
import { findNetworks, SCORE_FORMULA } from './networks.js';
import { annotateNodes, baseNodes } from './nodes.js';

export const GRAPH_NOTES = [
  'Exploratory graph of public records. A connection is not evidence of wrongdoing.',
  'established = stated in a source record; candidate = inferred (text mention, similar name) and needs review.',
  'weak edges (hub routes, text mentions, insolvency professionals, identity candidates) are shown but never chain networks.',
  'No director data is available, so shared-director links cannot be established.',
  SCORE_FORMULA,
];

function identityEdge(c: IdentityCandidate): GraphEdge {
  return {
    id: stableId('edg', c.a, 'possible_same_entity', c.b),
    from: c.a,
    to: c.b,
    type: 'possible_same_entity',
    basis: 'candidate',
    strength: 'weak',
    evidence_status: 'inference',
    source_id: 'graph_lab',
    date: null,
    document_id: null,
    relationship_id: null,
    confidence: Math.min(0.6, c.similarity * 0.6),
  };
}

function toGraphDocument(d: DocumentRecord): GraphDocument {
  return {
    id: d.document_id,
    url: d.url,
    title: d.title.slice(0, 220),
    date: d.publication_date,
    source_id: d.source_id,
  };
}

/** Only documents some node or edge cites; the first row wins when an item has several files. */
function citedDocuments(
  docs: readonly DocumentRecord[],
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): GraphDocument[] {
  const cited = new Set([...nodes.map((n) => n.document_id), ...edges.map((e) => e.document_id)]);
  const out = new Map<string, GraphDocument>();
  for (const d of docs)
    if (cited.has(d.document_id) && !out.has(d.document_id))
      out.set(d.document_id, toGraphDocument(d));
  return [...out.values()];
}

export interface BundleOptions {
  readonly synthetic: boolean;
  readonly label: string;
}

/** Builds the full graph-lab bundle from the canonical tables (pure; no I/O). */
export function buildGraph(input: GraphInput, opts: BundleOptions): GraphLabBundle {
  const nodes0 = baseNodes(input);
  const known = new Set(nodes0.map((n) => n.id));
  const relEdges = relationshipEdges(input.relationships, known);
  const hubs = findHubs(relEdges);
  const identity = identityCandidates(
    input.entities,
    input.matchCandidates,
    relEdges.filter((e) => e.type === 'registered_at'),
    hubs.get('address') ?? new Set(),
  ).filter((c) => known.has(c.a) && known.has(c.b));
  const edges = [
    ...withStrength(relEdges, hubs, regulatorIds(input.entities)),
    ...identity.map(identityEdge),
  ];
  const nodes = annotateNodes(nodes0, edges, hubs, input.events);
  const networks = findNetworks(nodes, edges);
  return {
    meta: {
      generated_at: new Date().toISOString(),
      synthetic: opts.synthetic,
      label: opts.label,
      dataset_built_at: input.datasetBuiltAt,
      thresholds: { ...THRESHOLDS },
      counts: counts(nodes, edges, networks.length, identity.length),
      notes: opts.synthetic
        ? ['SYNTHETIC TEST DATA — not real companies or findings.', ...GRAPH_NOTES]
        : GRAPH_NOTES,
    },
    nodes,
    edges,
    documents: citedDocuments(input.documents, nodes, edges),
    networks,
    identity,
  };
}

function counts(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  networks: number,
  identity: number,
): Record<string, number> {
  const out: Record<string, number> = {
    nodes: nodes.length,
    edges: edges.length,
    networks,
    identity_candidates: identity,
  };
  for (const n of nodes) out[`node:${n.kind}`] = (out[`node:${n.kind}`] ?? 0) + 1;
  for (const e of edges) {
    out[`edge:${e.type}`] = (out[`edge:${e.type}`] ?? 0) + 1;
    out[`basis:${e.basis}`] = (out[`basis:${e.basis}`] ?? 0) + 1;
    out[`strength:${e.strength}`] = (out[`strength:${e.strength}`] ?? 0) + 1;
  }
  out['hub_nodes'] = nodes.filter((n) => n.hub).length;
  return out;
}

/** A self-contained subset (for test data files): the given nodes plus edges among them. */
export function subBundle(
  full: GraphLabBundle,
  ids: ReadonlySet<string>,
  label: string,
): GraphLabBundle {
  const nodes = full.nodes.filter((n) => ids.has(n.id));
  const edges = full.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const docIds = new Set([...nodes.map((n) => n.document_id), ...edges.map((e) => e.document_id)]);
  return {
    meta: { ...full.meta, label, counts: counts(nodes, edges, 0, 0) },
    nodes,
    edges,
    documents: full.documents.filter((d) => docIds.has(d.id)),
    networks: full.networks.filter((n) => n.node_ids.every((id) => ids.has(id))),
    identity: full.identity.filter((c) => ids.has(c.a) && ids.has(c.b)),
  };
}
