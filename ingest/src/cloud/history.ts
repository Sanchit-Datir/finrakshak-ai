import {
  istDate,
  SourceIdSchema,
  type BuildRecord,
  type IngestRun,
  type SourceRunRecord,
} from '@finrakshak-ai/shared';
import { z } from 'zod';
import { dataKey } from '../config.js';
import { bigQuerySchema } from '../dataset/bigquery.js';
import { DeltaReportSchema } from '../delta/report.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJsonl } from '../store/jsonl.js';
import type { BigQueryLoader } from './bigquery.js';

/** One row per listed item that changed in a run (`delta_events`, partitioned by the IST `run_date`, B-27). */
export const DeltaEventRowSchema = z.object({
  run_id: z.string(),
  run_date: z.string().date(),
  run_at: z.string().datetime(),
  source_id: SourceIdSchema,
  item_id: z.string(),
  change: z.enum(['added', 'changed', 'removed']),
  mode: z.enum(['full', 'incremental']),
});

/** One row per source per run (`ingest_runs`): the agent's baselines come from this table. */
export const IngestRunRowSchema = z.object({
  run_id: z.string(),
  run_date: z.string().date(),
  run_at: z.string().datetime(),
  source_id: SourceIdSchema,
  status: z.enum(['ok', 'failed', 'skipped']),
  mode: z.enum(['full', 'incremental']).nullable(),
  added: z.number().int(),
  changed: z.number().int(),
  removed: z.number().int(),
  duration_ms: z.number().int(),
  texts_extracted: z.number().int(),
  error: z.string().nullable(),
  build_status: z.string().nullable(),
  version: z.string().nullable(),
});

async function deltaRows(
  runId: string,
  record: SourceRunRecord,
): Promise<z.infer<typeof DeltaEventRowSchema>[]> {
  if (record.report_key === null) return [];
  const report = await readJson(record.report_key, DeltaReportSchema);
  if (!report) return [];
  const base = {
    run_id: runId,
    run_date: istDate(report.run_at),
    run_at: report.run_at,
    source_id: report.source_id,
    mode: report.mode,
  };
  return [
    ...report.added.map((item_id) => ({ ...base, item_id, change: 'added' as const })),
    ...report.changed.map((item_id) => ({ ...base, item_id, change: 'changed' as const })),
    ...report.removed.map((item_id) => ({ ...base, item_id, change: 'removed' as const })),
  ];
}

function runRows(run: IngestRun, build: BuildRecord | null): z.infer<typeof IngestRunRowSchema>[] {
  return Object.values(run.sources).map((s) => ({
    run_id: run.run_id,
    run_date: istDate(s.run_at),
    run_at: s.run_at,
    source_id: s.source_id,
    status: s.status,
    mode: s.mode,
    added: s.added,
    changed: s.changed,
    removed: s.removed,
    duration_ms: s.duration_ms,
    texts_extracted: s.texts_extracted,
    error: s.error,
    build_status: build?.status ?? null,
    version: build?.version ?? null,
  }));
}

/** Appends this run's change events and per-source outcomes to the BigQuery history tables. */
export async function loadHistory(
  loader: BigQueryLoader,
  run: IngestRun,
  build: BuildRecord | null,
): Promise<void> {
  const deltas = (
    await Promise.all(Object.values(run.sources).map((s) => deltaRows(run.run_id, s)))
  ).flat();
  const tables = [
    {
      table: 'delta_events',
      rows: deltas,
      schema: DeltaEventRowSchema,
      cluster: ['source_id', 'change'],
    },
    {
      table: 'ingest_runs',
      rows: runRows(run, build),
      schema: IngestRunRowSchema,
      cluster: ['source_id'],
    },
  ];
  for (const t of tables) {
    if (t.rows.length === 0) continue;
    const key = dataKey('interim', 'runs', run.run_id, 'history', `${t.table}.jsonl`);
    await writeJsonl(
      key,
      t.rows.map((r) => t.schema.parse(r)),
    );
    const uri = blobs().uri(key);
    if (uri === null) continue;
    await loader.load({
      table: t.table,
      uri,
      schema: bigQuerySchema(t.schema),
      mode: 'append',
      partitionBy: 'run_date',
      clusterBy: t.cluster,
      jobId: `history_${t.table}_${run.run_id}`.replace(/[^\w-]/g, '_').slice(0, 1024),
    });
  }
}
