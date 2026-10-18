import { SourceIdSchema, SourceRunResultSchema, type SourceId } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { dataKey } from '../config.js';
import { writeJson } from '../store/jsonl.js';
import type { ListingDelta } from './diff.js';
import type { ListingMode } from './policy.js';

export const DeltaReportSchema = z.object({
  source_id: SourceIdSchema,
  run_at: z.string().datetime(),
  mode: z.enum(['full', 'incremental']),
  /** False for a capped (`maxItems`) or incremental run: `removed` is not evaluated. */
  complete: z.boolean(),
  fetched: z.number().int().nonnegative(),
  total_after: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  added: z.array(z.string()),
  changed: z.array(z.string()),
  removed: z.array(z.string()),
});
export type DeltaReport = z.infer<typeof DeltaReportSchema>;

export interface ReportInput {
  readonly source: SourceId;
  readonly runAt: string;
  readonly mode: ListingMode;
  readonly complete: boolean;
  readonly fetched: number;
  readonly totalAfter: number;
  readonly delta: ListingDelta;
}

export function makeReport(input: ReportInput): DeltaReport {
  const { delta } = input;
  return {
    source_id: input.source,
    run_at: input.runAt,
    mode: input.mode,
    complete: input.complete,
    fetched: input.fetched,
    total_after: input.totalAfter,
    unchanged: delta.unchanged,
    added: [...delta.added],
    changed: [...delta.changed],
    removed: [...delta.removed],
  };
}

/** Run timestamp as a key-safe stamp (`2026-10-17T03-05-00-000Z`). */
export const stamp = (runAt: string): string => runAt.replace(/[:.]/g, '-');

export const reportKey = (source: SourceId, runAt: string): string =>
  dataKey('interim', 'delta', source, `${stamp(runAt)}.json`);

/** One file per source and run (timestamped, so a quiet run never hides an earlier change). */
export async function writeReport(report: DeltaReport): Promise<void> {
  await writeJson(reportKey(report.source_id, report.run_at), report);
}

export { SourceRunResultSchema, type SourceRunResult } from '@finrakshak-ai/shared';

export const RunSummarySchema = z.object({
  run_at: z.string().datetime(),
  sources: z.array(SourceRunResultSchema),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export async function writeRunSummary(summary: RunSummary): Promise<void> {
  await writeJson(dataKey('interim', 'delta', 'runs', `${stamp(summary.run_at)}.json`), summary);
}

export const hasChanges = (r: DeltaReport): boolean =>
  r.added.length + r.changed.length + r.removed.length > 0;
