import type { RunReview } from '@fund-tracker/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearFirestore, emulatorFirestore } from '../test/emulator.js';
import { RUN_AT } from '../test/fixtures.js';
import { persistDrafts, toProposal, type ProposalDraft } from './proposals.js';
import { FirestoreAgentStore, PROPOSAL_COLLECTION, REVIEW_COLLECTION } from './store.js';

const db = emulatorFirestore();
const store = new FirestoreAgentStore(db);
const NOW = new Date(RUN_AT);
const relist: ProposalDraft = {
  source_id: 'ibbi',
  action: 'full_relist',
  reason: 'Quiet for days.',
  auto: false,
};

beforeEach(clearFirestore);
afterAll(() => db.terminate());

describe('FirestoreAgentStore', () => {
  it('lists only open proposals', async () => {
    const open = toProposal('run_1', relist, NOW);
    const done = toProposal('run_1', { ...relist, action: 'accept_shrink' }, NOW);
    await store.createProposal(open);
    await store.createProposal(done);
    await store.updateProposal({ ...done, status: 'rejected', decided_at: RUN_AT });
    expect((await store.openProposals()).map((p) => p.id)).toEqual([open.id]);
  });

  it('never overwrites a proposal when a retried run creates it again', async () => {
    const p = toProposal('run_1', relist, NOW);
    await store.createProposal(p);
    // The owner rejected it before the step was retried; the retry must not reset it.
    await store.updateProposal({ ...p, status: 'rejected', decided_at: RUN_AT, decided_by: 'u1' });
    await expect(store.createProposal(p)).resolves.toBeUndefined();
    const snap = await db.collection(PROPOSAL_COLLECTION).doc(p.id).get();
    expect(snap.get('status')).toBe('rejected');
  });

  it('skips a malformed proposal document instead of acting on it', async () => {
    await db.collection(PROPOSAL_COLLECTION).doc('p_bad').set({ status: 'approved', action: 'x' });
    await store.createProposal(toProposal('run_1', relist, NOW));
    expect(await store.openProposals()).toHaveLength(1);
  });

  it('refuses an invalid proposal or review before writing', async () => {
    await expect(
      store.createProposal({ ...toProposal('run_1', relist, NOW), reason: '' }),
    ).rejects.toThrow();
    const review: RunReview = {
      run_id: 'run_1',
      status: 'healthy',
      summary: '',
      findings: [],
      proposals_created: 0,
      model: null,
      prompt_version: 'v1',
      input_hash: 'a'.repeat(64),
      tool_calls: 0,
      generated_at: RUN_AT,
    };
    await expect(store.saveReview(review)).rejects.toThrow();
    await store.saveReview({ ...review, summary: 'All sources ran; nothing needs attention.' });
    expect((await db.collection(REVIEW_COLLECTION).doc('run_1').get()).exists).toBe(true);
  });

  it('persistDrafts keeps one open proposal per source and action across runs', async () => {
    expect(await persistDrafts(store, 'run_1', [relist], NOW)).toHaveLength(1);
    expect(await persistDrafts(store, 'run_2', [relist], NOW)).toHaveLength(0);
    expect(await store.openProposals()).toHaveLength(1);
  });
});
