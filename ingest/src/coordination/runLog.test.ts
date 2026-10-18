import type { BuildRecord, SourceRunRecord } from '@finrakshak-ai/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blobs } from '../storage/index.js';
import { freshFsStore } from '../test/tempData.js';
import { BlobRunLog, CompositeRunLog, emptyRun, type RunLog } from './runLog.js';

const source: SourceRunRecord = {
  source_id: 'ed',
  status: 'ok',
  mode: 'full',
  added: 1,
  changed: 0,
  removed: 0,
  error: null,
  run_at: '2026-10-17T03:05:00.000Z',
  finished_at: '2026-10-17T03:06:00.000Z',
  duration_ms: 60_000,
  texts_extracted: 1,
  texts_failed: 0,
  report_key: null,
  diagnostic_key: null,
};
const build: BuildRecord = {
  status: 'skipped',
  started_at: '2026-10-17T03:07:00.000Z',
  finished_at: '2026-10-17T03:07:01.000Z',
  reason: 'no source changed',
  built_at: null,
  version: null,
  rows: {},
  gates: [],
  bigquery: 'skipped',
  error: null,
};

beforeEach(() => {
  freshFsStore();
});

describe('BlobRunLog', () => {
  it('assembles a run from its step records', async () => {
    const log = new BlobRunLog();
    expect(await log.get('run_1')).toBeNull();
    await log.recordSource('run_1', source);
    await log.recordBuild('run_1', build);
    await log.recordReview('run_1', { status: 'degraded', rerunSources: ['ibbi'] });
    await log.recordExtraction('run_1', {
      status: 'skipped',
      reason: 'off',
      model: null,
      prompt_version: 'extract.v1',
      documents: 0,
      claims: 0,
      failed: 0,
      dropped: 0,
      finished_at: '2026-10-17T03:07:00.000Z',
    });
    const run = await log.get('run_1');
    expect(run).toMatchObject({
      run_id: 'run_1',
      build,
      review_status: 'degraded',
      rerun_sources: ['ibbi'],
      extraction: { status: 'skipped' },
    });
    expect(run?.sources['ed']).toEqual(source);
  });

  it('refuses to record or read malformed records', async () => {
    const log = new BlobRunLog();
    await expect(log.recordSource('run_1', { ...source, added: -1 })).rejects.toThrow();
    await blobs().write('interim/runs/run_2/sources/ed.json', '{"source_id":"ed"}');
    await expect(log.get('run_2')).rejects.toThrow(/Invalid JSON/);
  });

  it('emptyRun has the schema defaults', () => {
    expect(emptyRun('r')).toEqual({
      run_id: 'r',
      sources: {},
      build: null,
      extraction: null,
      rerun_sources: [],
      review_status: null,
    });
  });
});

describe('CompositeRunLog', () => {
  it('writes to every log and reads from the first', async () => {
    const a = new BlobRunLog();
    const recordSource = vi.fn<RunLog['recordSource']>(() => Promise.resolve());
    const recordBuild = vi.fn<RunLog['recordBuild']>(() => Promise.resolve());
    const get = vi.fn<RunLog['get']>(() => Promise.resolve(null));
    const spy: RunLog = {
      recordSource,
      recordBuild,
      recordReview: () => Promise.resolve(),
      recordExtraction: () => Promise.resolve(),
      get,
    };
    const both = new CompositeRunLog([a, spy]);
    await both.recordSource('run_1', source);
    await both.recordBuild('run_1', build);
    expect(recordSource).toHaveBeenCalledWith('run_1', source);
    expect(recordBuild).toHaveBeenCalledWith('run_1', build);
    expect((await both.get('run_1'))?.sources['ed']).toEqual(source);
    expect(get).not.toHaveBeenCalled();
  });
});
