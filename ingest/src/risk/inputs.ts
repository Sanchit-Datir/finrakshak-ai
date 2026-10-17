import type {
  PublicRecord,
  RuleEntity,
  RuleTransaction,
  ScoringLink,
  ScoringLoan,
  SeedVerificationFile,
} from '@fund-tracker/shared';

/**
 * The scoring job's input port (RISK_SCORING_PLAN.md design decision 3), like the storage port in
 * `ingest/src/storage/`: a file implementation for local runs (`fileInputs.ts`) now, a BigQuery one for
 * the cloud in step 11. Every implementation parses its rows with zod before returning them. It never
 * returns ground truth: truth labels are for the evaluation harness only (B-55).
 */

export interface ScoringData {
  readonly loans: readonly ScoringLoan[];
  readonly transactions: readonly RuleTransaction[];
  readonly entities: readonly RuleEntity[];
  readonly links: readonly ScoringLink[];
  /** Public records, already matched to entity ids by CIN or exact normalised name (B-37). */
  readonly records: readonly PublicRecord[];
  /** The owner's seed-case review; null when the file does not exist yet. */
  readonly seedReview: SeedVerificationFile | null;
  /** IST day the public data was built (B-43); null when the source has no build date. */
  readonly dataBuiltOn: string | null;
  /** First month (`YYYY-MM`) and number of months the data covers, for a replay. */
  readonly period: { readonly startMonth: string; readonly months: number } | null;
  /** Inputs that could not be read; any one marks every score stale (B-56). */
  readonly missingInputs: readonly string[];
  /** Records that matched no entity, or more than one (never merged, B-37). */
  readonly unmatchedRecords: number;
}

export interface ScoringInputPort {
  load(): Promise<ScoringData>;
}
