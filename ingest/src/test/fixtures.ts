import type { BuildRecord, IngestRun, SourceRunRecord } from '@fund-tracker/shared';

export const RUN_AT = '2026-10-17T03:05:00.000Z';

export function sourceRecord(
  over: Partial<SourceRunRecord> & Pick<SourceRunRecord, 'source_id'>,
): SourceRunRecord {
  return {
    status: 'ok',
    mode: 'incremental',
    added: 0,
    changed: 0,
    removed: 0,
    error: null,
    run_at: RUN_AT,
    finished_at: RUN_AT,
    duration_ms: 60_000,
    texts_extracted: 0,
    texts_failed: 0,
    report_key: null,
    diagnostic_key: null,
    ...over,
  };
}

export function buildRecord(over: Partial<BuildRecord> = {}): BuildRecord {
  return {
    status: 'dry_run',
    started_at: RUN_AT,
    finished_at: RUN_AT,
    reason: 'test',
    built_at: RUN_AT,
    version: 'v1',
    rows: {},
    gates: [],
    bigquery: 'skipped',
    error: null,
    ...over,
  };
}

export function runOf(
  sources: readonly SourceRunRecord[],
  build: BuildRecord | null = buildRecord(),
  runId = 'run_t',
): IngestRun {
  return {
    run_id: runId,
    sources: Object.fromEntries(sources.map((s) => [s.source_id, s])),
    build,
    extraction: null,
    rerun_sources: [],
    review_status: null,
  };
}
