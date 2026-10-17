import { RiskAlertDocSchema, RiskPatternRowSchema, RiskScoreRowSchema } from '@fund-tracker/shared';
import type { z } from 'zod';
import { bigQuerySchema } from '../dataset/bigquery.js';
import { ABSENT, blobs, joinKey, PreconditionFailedError } from '../storage/index.js';
import type { DailyOutput } from './daily.js';
import { contentHash, type TableLoader } from './synthTables.js';

/**
 * Writes a daily run's history to BigQuery (REMAINING_WORK.md, W2c): `risk_scores`, `risk_alerts` and
 * `risk_patterns`, append only and partitioned by `as_of` (B-57: corrections are new rows). The staged file
 * and the load job id carry the IST day and a hash of the rows without the run id and times, so a retry of
 * the same day loads nothing new (B-24), whichever run id it has.
 */

export const RISK_TABLES = {
  risk_scores: RiskScoreRowSchema,
  risk_alerts: RiskAlertDocSchema,
  risk_patterns: RiskPatternRowSchema,
} as const satisfies Record<string, z.AnyZodObject>;
export type RiskTableName = keyof typeof RISK_TABLES;

const CLUSTER: Readonly<Record<RiskTableName, readonly string[]>> = {
  risk_scores: ['loan_id'],
  risk_alerts: ['loan_id'],
  risk_patterns: ['pattern_id'],
};

export interface StagedTable {
  readonly table: RiskTableName;
  readonly rows: number;
  readonly key: string;
  readonly jobId: string;
}

/** The fields a retry may change (who ran it and when); the hash leaves them out. */
const VOLATILE: ReadonlySet<string> = new Set(['run_id', 'created_at', 'updated_at']);

const stableJson = (row: object): string =>
  JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !VOLATILE.has(k))));

async function stage(key: string, text: string): Promise<void> {
  try {
    await blobs().write(key, text, { condition: ABSENT, contentType: 'application/x-ndjson' });
  } catch (e) {
    if (!(e instanceof PreconditionFailedError)) throw e;
  }
}

/**
 * Stages each non-empty table under `interim/risk-load/` (create-only, Q1) and, when a loader is given
 * (the gcs store), appends it to BigQuery. On disk the staged files are the output.
 */
export async function writeHistory(
  out: DailyOutput,
  asOf: string,
  loader: TableLoader | null,
): Promise<StagedTable[]> {
  const tables: [RiskTableName, readonly { readonly run_id: string }[]][] = [
    ['risk_scores', out.scoreRows],
    ['risk_alerts', out.alertDocs],
    ['risk_patterns', out.patternRows],
  ];
  const staged: StagedTable[] = [];
  for (const [table, rows] of tables) {
    if (rows.length === 0) continue;
    const text = rows.map((r) => JSON.stringify(RISK_TABLES[table].parse(r))).join('\n');
    const hash = contentHash(rows.map(stableJson).join('\n'));
    const key = joinKey('interim', 'risk-load', asOf, hash, `${table}.jsonl`);
    const jobId = `${table}_${asOf.replaceAll('-', '')}_${hash}`;
    await stage(key, text);
    const uri = blobs().uri(key);
    if (loader !== null) {
      if (uri === null)
        throw new Error('BigQuery loads need the gcs store (FUNDTRACE_STORAGE=gcs)');
      await loader.load({
        table,
        uri,
        schema: bigQuerySchema(RISK_TABLES[table]),
        mode: 'append',
        partitionBy: 'as_of',
        clusterBy: CLUSTER[table],
        jobId,
      });
    }
    staged.push({ table, rows: rows.length, key, jobId });
  }
  return staged;
}
