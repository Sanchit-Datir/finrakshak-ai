import { RISK_ALERTS_COLLECTION, RISK_EXPLANATIONS_COLLECTION } from '@fund-tracker/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearFirestore, emulatorFirestore } from '../test/emulator.js';
import { FirestoreExplainStore } from './store.js';
import { alert } from './testing.js';

const db = emulatorFirestore();
const store = new FirestoreExplainStore(db);
const doc = {
  alert_id: 'L-0005_abc',
  loan_id: 'L-0005',
  branch_id: 'br-synth',
  run_id: 'run_1',
  text: 'A public record names the borrower (an allegation, not a finding).',
  model: 'gemini-test',
  prompt_version: 'explain.v1',
  input_hash: 'a'.repeat(64),
  created_at: '2025-09-30T22:00:00.000Z',
  synthetic: true as const,
};

beforeEach(clearFirestore);
afterAll(() => db.terminate());

describe('FirestoreExplainStore', () => {
  it('reads the run’s alerts and skips malformed ones', async () => {
    await db.collection(RISK_ALERTS_COLLECTION).doc('L-0005_abc').set(alert());
    await db
      .collection(RISK_ALERTS_COLLECTION)
      .doc('L-0006_x')
      .set({ ...alert(), score: 'high' });
    await db
      .collection(RISK_ALERTS_COLLECTION)
      .doc('L-0007_y')
      .set(alert({ alert_id: 'L-0007_y', run_id: 'run_2' }));
    expect((await store.alertsOfRun('run_1', 10)).map((a) => a.alert_id)).toEqual(['L-0005_abc']);
  });

  it('creates an explanation once and never touches the alert (B-57)', async () => {
    await db.collection(RISK_ALERTS_COLLECTION).doc('L-0005_abc').set(alert());
    expect(await store.create(doc)).toBe(true);
    expect(await store.create({ ...doc, text: 'Another public record (an allegation).' })).toBe(
      false,
    );
    const saved = await db.collection(RISK_EXPLANATIONS_COLLECTION).doc('L-0005_abc').get();
    expect(saved.get('text')).toBe(doc.text);
    const kept = await db.collection(RISK_ALERTS_COLLECTION).doc('L-0005_abc').get();
    expect(kept.data()).toEqual(alert());
    expect(await store.explained(['L-0005_abc', 'L-0009_z'])).toEqual(new Set(['L-0005_abc']));
  });
});
