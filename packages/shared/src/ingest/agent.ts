import { z } from 'zod';
import { SourceIdSchema } from '../evidence/sources.js';

/**
 * The ingestion agent's outputs (Firestore `ingestReviews/{runId}` and `agentProposals/{id}`).
 * Shared because the admin page reads them and `decideProposal` validates against them.
 */

export const FINDING_SEVERITIES = ['info', 'warn', 'critical'] as const;
export const FindingSeveritySchema = z.enum(FINDING_SEVERITIES);

/** Machine-readable kind of finding, computed by code (never invented by the model). */
export const FINDING_CODES = [
  'source_failed',
  'lease_conflict',
  'no_new_items',
  'spike_in_items',
  'items_removed',
  'slow_source',
  'full_relist_overdue',
  'build_failed',
  'gate_failed',
  'bigquery_failed',
  'text_extraction_failed',
  'ai_extraction_failed',
] as const;
export const FindingCodeSchema = z.enum(FINDING_CODES);

export const FindingSchema = z.object({
  source_id: SourceIdSchema.nullable(),
  severity: FindingSeveritySchema,
  code: FindingCodeSchema,
  detail: z.string().min(1).max(400),
});
export type Finding = z.infer<typeof FindingSchema>;

export const RUN_REVIEW_STATUSES = ['healthy', 'degraded', 'failed'] as const;

export const RunReviewSchema = z.object({
  run_id: z.string().min(1),
  status: z.enum(RUN_REVIEW_STATUSES),
  /** Plain-language summary for the owner; leads, never verdicts (B-36). */
  summary: z.string().min(1).max(800),
  findings: z.array(FindingSchema).max(50),
  proposals_created: z.number().int().nonnegative(),
  /** Model id, or null when the review was templated (healthy day or agent disabled). */
  model: z.string().nullable(),
  prompt_version: z.string(),
  /** sha256 of the digest the review was based on (no prompt text is stored). */
  input_hash: z.string().regex(/^[0-9a-f]{64}$/),
  tool_calls: z.number().int().nonnegative(),
  generated_at: z.string().datetime(),
});
export type RunReview = z.infer<typeof RunReviewSchema>;

/** The complete list of things the agent may ask for (B-49). Anything else is impossible. */
export const AGENT_ACTIONS = [
  'rerun_source',
  'full_relist',
  'accept_shrink',
  'pause_source',
  'adapter_fix_needed',
  'rollback_publish',
] as const;
export const AgentActionSchema = z.enum(AGENT_ACTIONS);
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const PROPOSAL_STATUSES = [
  'proposed',
  'auto_approved',
  'approved',
  'rejected',
  'applied',
  'expired',
  /** Owner closed it (e.g. resumed a paused source, or fixed the adapter). */
  'resolved',
] as const;
export const ProposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const AgentProposalSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  run_id: z.string().min(1),
  /** Null only for `rollback_publish`. */
  source_id: SourceIdSchema.nullable(),
  action: AgentActionSchema,
  reason: z.string().min(1).max(500),
  status: ProposalStatusSchema,
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  decided_at: z.string().datetime().nullable(),
  /** Firebase uid of the owner who decided, or `agent` for an automatic re-run. */
  decided_by: z.string().nullable(),
  applied_run_id: z.string().nullable(),
});
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

/** Input of the `decideProposal` callable. */
export const ProposalDecisionSchema = z.object({
  proposalId: AgentProposalSchema.shape.id,
  decision: z.enum(['approve', 'reject', 'resolve']),
});
export type ProposalDecision = z.infer<typeof ProposalDecisionSchema>;
