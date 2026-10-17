import { z } from 'zod';
import { IsoDateSchema } from '../../evidence/documents.js';
import { EVIDENCE_STATUSES } from '../../evidence/graph.js';

/**
 * What one scoring run produces for one loan (docs/plans/RISK_SCORING_PLAN.md, "Output and storage").
 * These are the shapes the job will write to `risk_scores` in step 11, so they are zod schemas: a row
 * read back is parsed, never cast.
 */

export const RISK_BANDS = ['routine', 'needs_attention', 'urgent'] as const;
export const RiskBandSchema = z.enum(RISK_BANDS);
export type RiskBand = z.infer<typeof RiskBandSchema>;

/** The app's wording for each band (web/src/domain/labels.ts). A score is a lead, never a verdict (B-58). */
export const RISK_BAND_LABELS: Readonly<Record<RiskBand, string>> = {
  routine: 'Routine review',
  needs_attention: 'Needs attention',
  urgent: 'Urgent review',
};

export const bandRank = (band: RiskBand): number => RISK_BANDS.indexOf(band);

export const SCORE_LAYERS = ['direct', 'pattern', 'graph', 'behaviour'] as const;
export type ScoreLayer = (typeof SCORE_LAYERS)[number];

export const REASON_CODES = [
  'public_record_after_disbursement',
  'public_record_before_disbursement',
  'nfra_finding',
  'several_proceedings',
  'many_sources',
  'related_party_record',
  'graph_proximity',
  'pattern_match',
  'missed_emi',
  'late_emi',
  'partial_emi',
  'growing_delay',
  'receipts_fall',
] as const;
export const ReasonCodeSchema = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const ReasonEvidenceStatusSchema = z.enum([...EVIDENCE_STATUSES, 'unknown']);
export type ReasonEvidenceStatus = z.infer<typeof ReasonEvidenceStatusSchema>;

/** The pattern fields of a `pattern_match` reason (PATTERN_CONTRACT.md, section 7). */
export const PatternReasonSchema = z.object({
  pattern_id: z.string().min(1),
  pattern_name: z.string().min(1),
  strength: z.number().min(0).max(1),
  support_weight: z.number().min(0).max(1),
});
export type PatternReason = z.infer<typeof PatternReasonSchema>;

export const ReasonSchema = z.object({
  code: ReasonCodeSchema,
  layer: z.enum(SCORE_LAYERS),
  /**
   * Stable identity of the reason across runs: the same record, neighbour, pattern or EMI problem keeps
   * the same key while its evidence grows. "New since last check" and the alert id use it.
   */
  reason_key: z.string().min(1),
  /** The entity the evidence is about (the borrower, a director, a neighbour). */
  subject_id: z.string().min(1),
  points: z.number().int().min(0).max(100),
  /** Public-record event ids, transaction ids or neighbour ids behind the reason. */
  evidence_ids: z.array(z.string()),
  /** B-36: stored as found, never upgraded. Transaction evidence is `fact`. */
  evidence_statuses: z.array(ReasonEvidenceStatusSchema),
  /** Where the evidence came from: a public source id, `transactions` or `graph`. */
  source: z.string().min(1),
  /** Numbers and short codes the templated text uses (counts, hops, days, dates). */
  facts: z.record(z.string(), z.union([z.string(), z.number()])),
  pattern: PatternReasonSchema.nullable(),
});
export type Reason = z.infer<typeof ReasonSchema>;

export interface LayerResult {
  readonly points: number;
  readonly reasons: readonly Reason[];
}

export const RUN_FINDING_CODES = [
  'no_patterns',
  'invalid_pattern',
  'unknown_template',
  'library_refused',
  'invalid_match_result',
  'no_seed_review',
  'stale_public_data',
  'missing_input',
] as const;
export const RunFindingCodeSchema = z.enum(RUN_FINDING_CODES);
export type RunFindingCode = z.infer<typeof RunFindingCodeSchema>;

export const RunFindingSchema = z.object({
  code: RunFindingCodeSchema,
  /** Short and free of record text. */
  detail: z.string().max(200),
});
export type RunFinding = z.infer<typeof RunFindingSchema>;

export const ALERT_KINDS = [
  'none',
  'band_up',
  'rise_with_new_reason',
  'override',
  'initial',
] as const;
export const AlertKindSchema = z.enum(ALERT_KINDS);
export type AlertKind = z.infer<typeof AlertKindSchema>;

/** One loan's score for one run, before the alert decision. */
export const LoanScoreSchema = z.object({
  score_id: z.string().min(1),
  loan_id: z.string().min(1),
  borrower_id: z.string().min(1),
  /** IST calendar day (B-27). */
  as_of: IsoDateSchema,
  score: z.number().int().min(0).max(100),
  /** The band of this run's score, Urgent review when the override applies. */
  band: RiskBandSchema,
  override: z.boolean(),
  points: z.object({
    direct: z.number().int().min(0),
    pattern: z.number().int().min(0),
    graph: z.number().int().min(0),
    behaviour: z.number().int().min(0),
  }),
  reasons: z.array(ReasonSchema),
  settings_version: z.string().min(1),
  /** The pattern library's `library_version`, or null when no library could be used. */
  pattern_version: z.number().int().min(0).nullable(),
  /** IST day the public data was built (B-43). */
  data_built_on: IsoDateSchema,
  /** B-56: old or missing inputs. Such a score never steps a band down. */
  stale_inputs: z.boolean(),
  /** B-56: the pattern layer had nothing to match; 0 there is not low risk. */
  no_patterns: z.boolean(),
});
export type LoanScore = z.infer<typeof LoanScoreSchema>;
