import { BigQuery } from '@google-cloud/bigquery';
import { SourceRunRecordSchema, type SourceId } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { dataKey } from '../config.js';
import { blobs } from '../storage/index.js';
import { readJson } from '../store/jsonl.js';

/** One past outcome of a source (a row of BigQuery `ingest_runs`). */
export const HistoryRowSchema = z.object({
  run_id: z.string(),
  run_at: z.string(),
  status: z.enum(['ok', 'failed', 'skipped']),
  mode: z.enum(['full', 'incremental']).nullable(),
  added: z.coerce.number().int(),
  changed: z.coerce.number().int(),
  removed: z.coerce.number().int(),
  duration_ms: z.coerce.number().int(),
});
export type HistoryRow = z.infer<typeof HistoryRowSchema>;

/** Where baselines come from. Newest first; the current run is excluded by the caller. */
export interface HistorySource {
  recent(source: SourceId, days: number): Promise<HistoryRow[]>;
}

/** Hard cap on what one baseline query may scan (COST_GUIDELINES: maximum bytes billed). */
const MAX_BYTES_BILLED = String(50 * 1024 * 1024);
const QUERY_TIMEOUT_MS = 30_000;

export class BigQueryHistory implements HistorySource {
  private readonly bq: BigQuery;

  constructor(
    private readonly dataset: string,
    private readonly location: string,
    projectId?: string,
  ) {
    this.bq = new BigQuery({ ...(projectId === undefined ? {} : { projectId }), location });
  }

  async recent(source: SourceId, days: number): Promise<HistoryRow[]> {
    const [rows] = await this.bq.query({
      // Parameterised and partition-bounded; no SELECT *.
      query: `SELECT run_id, CAST(run_at AS STRING) AS run_at, status, mode, added, changed, removed, duration_ms
              FROM \`${this.dataset}.ingest_runs\`
              WHERE source_id = @source AND run_date >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL @days DAY)
              ORDER BY run_at DESC LIMIT 200`,
      params: { source, days },
      location: this.location,
      maximumBytesBilled: MAX_BYTES_BILLED,
      jobTimeoutMs: QUERY_TIMEOUT_MS,
    });
    return z.array(HistoryRowSchema).parse(rows);
  }
}

/** Reads past run records from the bucket / disk (local runs and before BigQuery has history). */
export class BlobHistory implements HistorySource {
  async recent(source: SourceId, days: number): Promise<HistoryRow[]> {
    const since = Date.now() - days * 86_400_000;
    const keys = (await blobs().list(dataKey('interim', 'runs')))
      .map((b) => b.key)
      .filter((k) => k.endsWith(`/sources/${source}.json`));
    const rows: HistoryRow[] = [];
    for (const key of keys) {
      const r = await readJson(key, SourceRunRecordSchema);
      if (r && Date.parse(r.run_at) >= since) rows.push({ ...r, run_id: key.split('/')[2] ?? '' });
    }
    return rows.sort((a, b) => b.run_at.localeCompare(a.run_at));
  }
}
