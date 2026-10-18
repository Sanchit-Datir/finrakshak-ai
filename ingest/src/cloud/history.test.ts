import type { BuildRecord, IngestRun } from '@finrakshak-ai/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJsonl } from '../store/jsonl.js';
import { freshFsStore } from '../test/tempData.js';
import { writeReport } from '../delta/report.js';
import type { BigQueryLoader, LoadSpec } from './bigquery.js';
import { DeltaEventRowSchema, IngestRunRowSchema, loadHistory } from './history.js';

const RUN_AT = '2026-10-17T20:00:00.000Z'; // already 18 Oct in India
const run = (reportKey: string | null): IngestRun => ({
  run_id: 'run_1',
  sources: {
    ibbi: {
      source_id: 'ibbi',
      status: 'ok',
      mode: 'incremental',
      added: 2,
      changed: 1,
      removed: 0,
      error: null,
      run_at: RUN_AT,
      finished_at: RUN_AT,
      duration_ms: 5,
      texts_extracted: 0,
      texts_failed: 0,
      report_key: reportKey,
      diagnostic_key: null,
    },
  },
  build: null,
  extraction: null,
  rerun_sources: [],
  review_status: null,
});
const build = { status: 'dry_run', version: 'v1' } as BuildRecord;

beforeEach(() => {
  freshFsStore();
});

describe('loadHistory', () => {
  it('writes change events and run rows with the IST run date (B-27)', async () => {
    await writeReport({
      source_id: 'ibbi',
      run_at: RUN_AT,
      mode: 'incremental',
      complete: false,
      fetched: 3,
      total_after: 10,
      unchanged: 0,
      added: ['a', 'b'],
      changed: ['c'],
      removed: [],
    });
    const loads: LoadSpec[] = [];
    const loader = {
      load: vi.fn((s: LoadSpec) => {
        loads.push(s);
        return Promise.resolve();
      }),
    } as unknown as BigQueryLoader;
    await loadHistory(loader, run('interim/delta/ibbi/2026-10-17T20-00-00-000Z.json'), build);
    const events = await readJsonl(
      'interim/runs/run_1/history/delta_events.jsonl',
      DeltaEventRowSchema,
    );
    expect(events.map((e) => [e.item_id, e.change, e.run_date])).toEqual([
      ['a', 'added', '2026-10-18'],
      ['b', 'added', '2026-10-18'],
      ['c', 'changed', '2026-10-18'],
    ]);
    const runs = await readJsonl(
      'interim/runs/run_1/history/ingest_runs.jsonl',
      IngestRunRowSchema,
    );
    expect(runs[0]).toMatchObject({
      source_id: 'ibbi',
      run_date: '2026-10-18',
      build_status: 'dry_run',
      version: 'v1',
    });
    // On disk there is no gs:// URI, so nothing is sent to BigQuery.
    expect(loads).toEqual([]);
  });

  it('skips empty tables and runs without a report', async () => {
    const loader = { load: vi.fn() } as unknown as BigQueryLoader;
    await loadHistory(loader, run(null), null);
    expect(
      await readJsonl('interim/runs/run_1/history/delta_events.jsonl', DeltaEventRowSchema),
    ).toEqual([]);
    expect(
      await readJsonl('interim/runs/run_1/history/ingest_runs.jsonl', IngestRunRowSchema),
    ).toHaveLength(1);
  });
});
