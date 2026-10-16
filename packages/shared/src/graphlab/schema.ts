import { z } from 'zod';

/**
 * Graph-lab bundle: an exploratory, local-only view of the public-source dataset as a
 * graph. Produced by `ingest` (graph CLI) and read by the web Graph lab page.
 * Every edge points back to a document; nothing here is a finding of wrongdoing.
 */

export const GRAPH_NODE_KINDS = [
  'company',
  'bank',
  'llp',
  'audit_firm',
  'other_org',
  'person',
  'address',
  'event',
] as const;
export const GraphNodeKindSchema = z.enum(GRAPH_NODE_KINDS);
export type GraphNodeKind = z.infer<typeof GraphNodeKindSchema>;

export const GRAPH_EDGE_TYPES = [
  'named_in',
  'mentioned_in',
  'insolvency_applicant_against',
  'insolvency_professional_for',
  'auditor_of',
  'audit_partner_for',
  'registered_at',
  'possible_same_entity',
] as const;
export const GraphEdgeTypeSchema = z.enum(GRAPH_EDGE_TYPES);
export type GraphEdgeType = z.infer<typeof GraphEdgeTypeSchema>;

/** established = stated by a source record; candidate = inferred and needs review. */
export const EdgeBasisSchema = z.enum(['established', 'candidate']);
export type EdgeBasis = z.infer<typeof EdgeBasisSchema>;

/** strong edges are used for network discovery; weak ones are shown but never chain networks. */
export const EdgeStrengthSchema = z.enum(['strong', 'weak']);
export type EdgeStrength = z.infer<typeof EdgeStrengthSchema>;

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  kind: GraphNodeKindSchema,
  label: z.string().min(1),
  /** CIN/LLPIN, role, MCA status or "authority · proceeding status" for events. */
  detail: z.string().nullable(),
  sources: z.array(z.string()),
  date: z.string().nullable(),
  document_id: z.string().nullable(),
  evidence_status: z.string().nullable(),
  adverse_events: z.number().int().nonnegative(),
  seed_cases: z.array(z.string()),
  /** A hub links too many nodes to be meaningful (big bank, batch press release, busy professional). */
  hub: z.boolean(),
  /** Roles in which the node is a hub: event, creditor, person, auditor, address. */
  hub_roles: z.array(z.string()),
  degree: z.number().int().nonnegative(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  type: GraphEdgeTypeSchema,
  basis: EdgeBasisSchema,
  strength: EdgeStrengthSchema,
  evidence_status: z.string(),
  source_id: z.string(),
  date: z.string().nullable(),
  document_id: z.string().nullable(),
  relationship_id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphDocumentSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  title: z.string(),
  date: z.string().nullable(),
  source_id: z.string(),
});
export type GraphDocument = z.infer<typeof GraphDocumentSchema>;

export const GraphNetworkSchema = z.object({
  id: z.string().min(1),
  node_ids: z.array(z.string()),
  organisation_count: z.number().int().nonnegative(),
  adverse_organisation_count: z.number().int().nonnegative(),
  sources: z.array(z.string()),
  seed_cases: z.array(z.string()),
  score: z.number(),
  summary: z.string(),
});
export type GraphNetwork = z.infer<typeof GraphNetworkSchema>;

export const IdentityCandidateSchema = z.object({
  id: z.string().min(1),
  a: z.string().min(1),
  b: z.string().min(1),
  name_a: z.string(),
  name_b: z.string(),
  similarity: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  status: z.literal('needs_review'),
});
export type IdentityCandidate = z.infer<typeof IdentityCandidateSchema>;

export const GraphLabMetaSchema = z.object({
  generated_at: z.string(),
  /** true for clearly labelled synthetic test scenarios — never real findings. */
  synthetic: z.boolean(),
  label: z.string(),
  dataset_built_at: z.string().nullable(),
  thresholds: z.record(z.string(), z.number()),
  counts: z.record(z.string(), z.number()),
  notes: z.array(z.string()),
});
export type GraphLabMeta = z.infer<typeof GraphLabMetaSchema>;

export const GraphLabBundleSchema = z.object({
  meta: GraphLabMetaSchema,
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  documents: z.array(GraphDocumentSchema),
  networks: z.array(GraphNetworkSchema),
  identity: z.array(IdentityCandidateSchema),
});
export type GraphLabBundle = z.infer<typeof GraphLabBundleSchema>;

/** data/graph/index.json — the bundles available to the viewer. */
export const GraphLabIndexEntrySchema = z.object({
  file: z.string().min(1),
  label: z.string(),
  synthetic: z.boolean(),
});
export const GraphLabIndexSchema = z.array(GraphLabIndexEntrySchema);
export type GraphLabIndexEntry = z.infer<typeof GraphLabIndexEntrySchema>;
