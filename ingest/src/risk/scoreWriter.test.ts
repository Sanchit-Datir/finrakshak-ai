import { describe, expect, it } from 'vitest';
import { SCORING_SETTINGS_V1 as S, matchPattern } from '@finrakshak-ai/shared';
import type { LoadSpec } from '../cloud/bigquery.js';
import { writeSmallDataset } from '../test/synthScoring.js';
import { freshFsStore, freshGcsLikeStore } from '../test/tempData.js';
import { scoreDay } from './daily.js';
import { fileScoringInputs } from './fileInputs.js';
import { codePatterns, loadLibrary } from './patternSources.js';
import { writeHistory } from './scoreWriter.js';

const dir = writeSmallDataset();
const data = await fileScoringInputs({ dir, seedReviewFile: `${dir}/none.json` }).load();
const library = await loadLibrary(codePatterns());
const out = (runId: string): ReturnType<typeof scoreDay> =>
  scoreDay({
    data,
    asOf: '2025-06-30',
    runId,
    now: '2025-06-30T00:00:00.000Z',
    settings: S,
    library,
    matcher: matchPattern,
    previous: new Map(),
  });

const recorder = (): { specs: LoadSpec[]; load: (s: LoadSpec) => Promise<void> } => {
  const specs: LoadSpec[] = [];
  return { specs, load: (s) => Promise.resolve(void specs.push(s)) };
};

describe('writeHistory (W2c)', () => {
  it('appends scores, alerts and patterns, partitioned by as_of, with deterministic job ids', async () => {
    freshGcsLikeStore();
    const r = recorder();
    const staged = await writeHistory(out('run_1'), '2025-06-30', r);
    expect(r.specs.map((s) => s.table)).toEqual(['risk_scores', 'risk_alerts', 'risk_patterns']);
    expect(r.specs.every((s) => s.mode === 'append' && s.partitionBy === 'as_of')).toBe(true);
    expect(r.specs.every((s) => s.jobId?.includes('_20250630_'))).toBe(true);
    expect(
      staged.map((s) => s.key).every((k) => k.startsWith('interim/risk-load/2025-06-30/')),
    ).toBe(true);
    const scores = r.specs[0]?.schema ?? [];
    expect(scores.find((f) => f.name === 'as_of')).toMatchObject({ type: 'DATE' });
    expect(scores.find((f) => f.name === 'reasons')).toMatchObject({
      mode: 'REPEATED',
      type: 'RECORD',
    });
  });

  it('a retry of the same day with another run id reuses the job ids, so nothing is added (B-24, B-57)', async () => {
    freshGcsLikeStore();
    const a = recorder();
    const b = recorder();
    await writeHistory(out('run_1'), '2025-06-30', a);
    await writeHistory(out('run_2'), '2025-06-30', b);
    expect(b.specs.map((s) => s.jobId)).toEqual(a.specs.map((s) => s.jobId));
  });

  it('on disk, stages the files and loads nothing', async () => {
    const store = freshFsStore();
    const staged = await writeHistory(out('run_1'), '2025-06-30', null);
    expect(staged.length).toBe(3);
    expect((await store.list('interim/risk-load')).length).toBe(3);
  });

  it('refuses a BigQuery load when the store has no gs:// URIs', async () => {
    freshFsStore();
    await expect(writeHistory(out('run_1'), '2025-06-30', recorder())).rejects.toThrow(/gcs/);
  });
});
