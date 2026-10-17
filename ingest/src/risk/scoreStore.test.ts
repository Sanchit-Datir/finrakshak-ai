import { describe, expect, it } from 'vitest';
import { SCORING_SETTINGS_V1 as S, matchPattern } from '@fund-tracker/shared';
import { writeSmallDataset } from '../test/synthScoring.js';
import { scoreDay } from './daily.js';
import { fileScoringInputs } from './fileInputs.js';
import { codePatterns, loadLibrary } from './patternSources.js';
import { MemoryRiskStore } from './scoreStore.js';

const dir = writeSmallDataset();
const data = await fileScoringInputs({ dir, seedReviewFile: `${dir}/none.json` }).load();
const out = scoreDay({
  data,
  asOf: '2025-12-31',
  runId: 'run_1',
  now: '2025-12-31T00:00:00.000Z',
  settings: S,
  library: await loadLibrary(codePatterns()),
  matcher: matchPattern,
  previous: new Map(),
});

describe('MemoryRiskStore', () => {
  it('keeps the first copy of an alert and the latest copy of a score', async () => {
    const store = new MemoryRiskStore();
    expect(await store.createAlerts(out.alertDocs)).toBe(out.alertDocs.length);
    expect(await store.createAlerts(out.alertDocs)).toBe(0);
    await store.writeLatest(out.latestDocs);
    expect((await store.readLatest()).docs.size).toBe(out.latestDocs.length);
  });

  it('refuses a document that does not match the schema', async () => {
    const store = new MemoryRiskStore();
    const [doc] = out.latestDocs;
    expect(doc).toBeDefined();
    if (doc === undefined) return;
    await expect(store.writeLatest([{ ...doc, as_of: 'yesterday' }])).rejects.toThrow();
  });
});
