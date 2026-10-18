import { z } from 'zod';
import { IsoDateSchema, UtcTimestampSchema } from '../../evidence/documents.js';
import {
  AlertKindSchema,
  LoanScoreSchema,
  ReasonSchema,
  RiskBandSchema,
  type AlertKind,
} from './types.js';

/**
 * What the cloud scoring job keeps between runs and what the app reads (REMAINING_WORK.md, W2e and W3a;
 * question Q3). Firestore `synthRiskLatest/{loanId}` holds each loan's latest score and the alert state the
 * next run starts from; `synthRiskAlerts/{alertId}` holds one document per alert, never rewritten (B-57).
 * Both are SYNTH only (B-54), written by the job and read only through the `getRiskScores` callable.
 */

export const RISK_LATEST_COLLECTION = 'synthRiskLatest';
export const RISK_ALERTS_COLLECTION = 'synthRiskAlerts';

const id = z.string().min(1).max(200);

/** `AlertState` plus every reason key ever alerted (an alerted reason never counts as new again). */
export const StoredAlertStateSchema = z.object({
  score: z.number().int().min(0).max(100),
  held_band: RiskBandSchema,
  clean_runs: z.number().int().min(0),
  reason_keys: z.array(z.string()),
  alerted_keys: z.array(z.string()),
});
export type StoredAlertState = z.infer<typeof StoredAlertStateSchema>;

/** The state before the stored run, so a retry of the same IST day gives the same result (B-24). */
export const PriorRunSchema = z.object({
  as_of: IsoDateSchema,
  state: StoredAlertStateSchema,
  score: LoanScoreSchema,
});
export type PriorRun = z.infer<typeof PriorRunSchema>;

export const RiskLatestDocSchema = z.object({
  loan_id: id,
  branch_id: id,
  borrower_id: id,
  run_id: id,
  /** IST day of the run (B-27). */
  as_of: IsoDateSchema,
  latest: LoanScoreSchema,
  /** The band shown to a reviewer: it lags a fall by the clean-run rule. */
  held_band: RiskBandSchema,
  alert_kind: AlertKindSchema,
  /** Null for the first score. */
  delta: z.number().int().nullable(),
  /** The templated "new / unchanged / score change" block. */
  change_text: z.string().max(8000),
  state: StoredAlertStateSchema,
  previous: PriorRunSchema.nullable(),
  updated_at: UtcTimestampSchema,
  synthetic: z.literal(true),
});
export type RiskLatestDoc = z.infer<typeof RiskLatestDocSchema>;

export const RAISED_ALERT_KINDS = [
  'band_up',
  'rise_with_new_reason',
  'override',
  'initial',
] as const;
export const RaisedAlertKindSchema = z.enum(RAISED_ALERT_KINDS);
export type RaisedAlertKind = z.infer<typeof RaisedAlertKindSchema>;

export const isRaised = (kind: AlertKind): kind is RaisedAlertKind => kind !== 'none';

export const RiskAlertDocSchema = z.object({
  /** Loan plus the alerted reason keys, hashed: the same alert again is the same document. */
  alert_id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  loan_id: id,
  branch_id: id,
  borrower_id: id,
  run_id: id,
  as_of: IsoDateSchema,
  kind: RaisedAlertKindSchema,
  band: RiskBandSchema,
  score: z.number().int().min(0).max(100),
  delta: z.number().int().nullable(),
  /** The reasons this alert is about. */
  reasons: z.array(ReasonSchema),
  change_text: z.string().max(8000),
  settings_version: z.string().min(1),
  data_built_on: IsoDateSchema,
  created_at: UtcTimestampSchema,
  status: z.enum(['open']),
  synthetic: z.literal(true),
});
export type RiskAlertDoc = z.infer<typeof RiskAlertDocSchema>;

/** One row of BigQuery `risk_scores` (append only, partitioned by `as_of`; B-57). */
export const RiskScoreRowSchema = LoanScoreSchema.extend({
  run_id: id,
  branch_id: id,
  held_band: RiskBandSchema,
  previous_score: z.number().int().min(0).max(100).nullable(),
  previous_band: RiskBandSchema.nullable(),
  delta: z.number().int().nullable(),
  alert_kind: AlertKindSchema,
  synthetic: z.literal(true),
});
export type RiskScoreRow = z.infer<typeof RiskScoreRowSchema>;

/** One row of BigQuery `risk_patterns`: the library each run used, so any score can be reproduced. */
export const RiskPatternRowSchema = z.object({
  run_id: id,
  as_of: IsoDateSchema,
  library_version: z.number().int().min(0),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  pattern_id: z.string().min(1),
  pattern: z.record(z.string(), z.unknown()),
});
export type RiskPatternRow = z.infer<typeof RiskPatternRowSchema>;

/** Input of `getRiskScores`: one loan, or every loan the caller may see. */
export const GetRiskScoresInputSchema = z.object({
  loanId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,120}$/)
    .optional(),
});
export type GetRiskScoresInput = z.infer<typeof GetRiskScoresInputSchema>;

/** One loan's latest score as the app sees it (the stored alert state stays on the server). */
export const RiskScoreViewSchema = RiskLatestDocSchema.omit({ state: true, previous: true });
export type RiskScoreView = z.infer<typeof RiskScoreViewSchema>;

/**
 * One point of a loan's score history (a month-end run). Only the bundled sample carries history for now;
 * the cloud history sits in BigQuery and has no reader yet (B-57: history is append-only).
 */
export const RiskHistoryPointSchema = z.object({
  as_of: IsoDateSchema,
  score: z.number().int().min(0).max(100),
  held_band: RiskBandSchema,
});
export type RiskHistoryPoint = z.infer<typeof RiskHistoryPointSchema>;

/** Loan id to its points, oldest first. */
export const RiskHistorySchema = z.record(z.string(), z.array(z.unknown()));

/** Result of `getRiskScores`. Parsed on the web side; a malformed item is dropped and counted. */
export const GetRiskScoresResultSchema = z.object({
  scores: z.array(z.unknown()),
  alerts: z.array(z.unknown()),
  /** AI-written sentences for some of the alerts (RISK_EXPLAINER_PLAN.md); absent from older servers. */
  explanations: z.array(z.unknown()).default([]),
  /** True when more documents existed than one call returns. */
  truncated: z.boolean(),
});
export type GetRiskScoresResult = z.infer<typeof GetRiskScoresResultSchema>;

/** Most loans and alerts one call returns (Firestore reads are billed per document, B-15). */
export const RISK_SCORES_PAGE = 500;
export const RISK_ALERTS_PAGE = 200;
