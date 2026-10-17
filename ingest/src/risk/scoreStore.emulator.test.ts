import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  RISK_ALERTS_COLLECTION,
  RISK_LATEST_COLLECTION,
  SCORING_SETTINGS_V1 as S,
  matchPattern,
} from '@fund-tracker/shared';
import { clearFirestore, emulatorFirestore } from '../test/emulator.js';
import { writeSmallDataset } from '../test/synthScoring.js';
import { scoreDay } from './daily.js';
import { fileScoringInputs } from './fileInputs.js';
import { codePatterns, loadLibrary } from './patternSources.js';
import { FirestoreRiskStore, SCORER_COLLECTIONS } from './scoreStore.js';

const db = emulatorFirestore();
const store = new FirestoreRiskStore(db);
const dir = writeSmallDataset();
const data = await fileScoringInputs({ dir, seedReviewFile: `${dir}/none.json` }).load();
const library = await loadLibrary(codePatterns());
const out = scoreDay({
  data,
  asOf: '2025-12-31',
  runId: 'run_1',
  now: '2025-12-31T00:00:00.000Z',
  settings: S,
  library,
  matcher: matchPattern,
  previous: new Map(),
});

beforeEach(clearFirestore);
afterAll(() => db.terminate());

describe('FirestoreRiskStore', () => {
  it('writes latest documents that read back equal, keyed by loan id', async () => {
    await store.writeLatest(out.latestDocs);
    const { docs, malformed } = await store.readLatest();
    expect(malformed).toBe(0);
    expect([...docs.keys()].sort()).toEqual(out.latestDocs.map((d) => d.loan_id).sort());
    expect(docs.get(out.latestDocs[0]?.loan_id ?? '')).toEqual(out.latestDocs[0]);
  });

  it('creates each alert once and never rewrites it (B-57)', async () => {
    expect(out.alertDocs.length).toBeGreaterThan(0);
    expect(await store.createAlerts(out.alertDocs)).toBe(out.alertDocs.length);
    expect(await store.createAlerts(out.alertDocs.map((a) => ({ ...a, run_id: 'run_2' })))).toBe(0);
    const first = out.alertDocs[0];
    const snap = await db
      .collection(RISK_ALERTS_COLLECTION)
      .doc(first?.alert_id ?? '')
      .get();
    expect(snap.get('run_id')).toBe('run_1');
  });

  it('skips and counts a malformed latest document instead of acting on it', async () => {
    await db.collection(RISK_LATEST_COLLECTION).doc('L-bad').set({ loan_id: 'L-bad', score: 'x' });
    const { docs, malformed } = await store.readLatest();
    expect(malformed).toBe(1);
    expect(docs.has('L-bad')).toBe(false);
  });

  it('writes only the two synthetic risk collections (Q6)', async () => {
    await store.writeLatest(out.latestDocs);
    await store.createAlerts(out.alertDocs);
    const names = (await db.listCollections()).map((c) => c.id).sort();
    expect(names).toEqual([...SCORER_COLLECTIONS].sort());
  });
});
