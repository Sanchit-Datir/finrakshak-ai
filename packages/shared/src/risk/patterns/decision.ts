import { z } from 'zod';
import { PatternIdSchema, PatternProposalSchema } from './schema.js';

/**
 * Where the pattern miner's proposals and the live library live (PATTERN_CONTRACT.md, sections 4 and 5),
 * and the input of the `decidePattern` callable (PATTERN_MINER_PLAN.md, "Approval and use"; B-61). The
 * miner writes proposals only; only the callable, run by an administrator, writes the library.
 */

export const PATTERN_PROPOSALS_COLLECTION = 'patternProposals';
export const PATTERN_LIBRARY_COLLECTION = 'riskPatternLibrary';
/** The one document the scorer reads; `v<n>` documents beside it are immutable copies. */
export const PATTERN_LIBRARY_CURRENT = 'current';
export const patternLibraryVersionDoc = (version: number): string => `v${version}`;

/** A proposal nobody decided expires after this many days (owner's decision). */
export const PATTERN_PROPOSAL_TTL_DAYS = 30;

const proposalId = PatternProposalSchema.shape.proposal_id;

/** approve / reject act on a proposal; retire acts on a live pattern. */
export const PatternDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), proposalId }).strict(),
  z.object({ decision: z.literal('reject'), proposalId }).strict(),
  z.object({ decision: z.literal('retire'), patternId: PatternIdSchema }).strict(),
]);
export type PatternDecision = z.infer<typeof PatternDecisionSchema>;

export const PatternDecisionResultSchema = z.object({
  /** The proposal's new status, or `retired` for a retirement. */
  status: z.enum(['approved', 'rejected', 'retired']),
  /** The library version after the decision; null when the library did not change (a rejection). */
  libraryVersion: z.number().int().min(0).nullable(),
});
export type PatternDecisionResult = z.infer<typeof PatternDecisionResultSchema>;
