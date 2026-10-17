import { z } from 'zod';
import { SourceIdSchema } from '../evidence/sources.js';

/**
 * Records of the daily cloud ingestion run (Firestore `ingestRuns/{runId}`, BigQuery
 * `ingest_runs`). Shared because the admin page and the agent read them.
 */

export const LISTING_MODES = ['full', 'incremental'] as const;
export const ListingModeSchema = z.enum(LISTING_MODES);

export const SOURCE_RUN_STATUSES = ['ok', 'failed', 'skipped'] as const;

/** Outcome of one source in one run (listing + downloads). */
export const SourceRunResultSchema = z.object({
  source_id: SourceIdSchema,
  status: z.enum(SOURCE_RUN_STATUSES),
  mode: ListingModeSchema.nullable(),
  added: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  /** `<step>: <message>`, already truncated; never document text or secrets. */
  error: z.string().max(500).nullable(),
});
export type SourceRunResult = z.infer<typeof SourceRunResultSchema>;

export const SourceRunRecordSchema = SourceRunResultSchema.extend({
  run_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  duration_ms: z.number().int().nonnegative(),
  /** Documents whose text was extracted in this run. */
  texts_extracted: z.number().int().nonnegative(),
  texts_failed: z.number().int().nonnegative(),
  /** Storage key of this run's delta report, when the listing step ran. */
  report_key: z.string().nullable(),
});
export type SourceRunRecord = z.infer<typeof SourceRunRecordSchema>;

/** One publish gate (B-50): every gate must pass before a build reaches the app. */
export const GateResultSchema = z.object({
  id: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().max(500),
});
export type GateResult = z.infer<typeof GateResultSchema>;

export const BUILD_STATUSES = ['published', 'dry_run', 'skipped', 'gate_failed', 'failed'] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

export const BuildRecordSchema = z.object({
  status: z.enum(BUILD_STATUSES),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  /** Why a build was skipped or what changed (`ibbi: 12 added`, `mca upload`). */
  reason: z.string().max(500),
  built_at: z.string().datetime().nullable(),
  version: z.string().nullable(),
  rows: z.record(z.string(), z.number().int().nonnegative()),
  gates: z.array(GateResultSchema),
  bigquery: z.enum(['loaded', 'skipped', 'failed']),
  error: z.string().max(500).nullable(),
});
export type BuildRecord = z.infer<typeof BuildRecordSchema>;

export const IngestRunSchema = z.object({
  run_id: z.string().min(1),
  sources: z.record(z.string(), SourceRunRecordSchema).default({}),
  build: BuildRecordSchema.nullable().default(null),
  /** Sources the agent re-runs within this run (automatic `rerun_source`, transient errors only). */
  rerun_sources: z.array(SourceIdSchema).default([]),
  review_status: z.enum(['healthy', 'degraded', 'failed']).nullable().default(null),
});
export type IngestRun = z.infer<typeof IngestRunSchema>;
