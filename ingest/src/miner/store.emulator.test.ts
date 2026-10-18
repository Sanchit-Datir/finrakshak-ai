import { AGENT_RUNS_COLLECTION, sealLibrary } from '@finrakshak-ai/shared';
import { Timestamp } from '@google-cloud/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { envelope, FirestoreAgentRunStore, NO_USAGE } from '../ai/agentRuns.js';
import { clearFirestore, emulatorFirestore } from '../test/emulator.js';
import { sha256Hex } from './hash.js';
import { toPatternProposal } from './proposals.js';
import { FirestorePatternProposalStore } from './store.js';
import { plantedContext } from './testing.js';
import { templatedWording } from './wording.js';

const db = emulatorFirestore();
const store = new FirestorePatternProposalStore(db);
const c = plantedContext().result.candidates[0];
if (c === undefined) throw new Error('the planted pattern must be found');
const NOW = new Date('2026-10-17T10:00:00.000Z');
const LATER = new Date('2026-12-01T00:00:00.000Z');
const proposal = toPatternProposal(c, templatedWording(c), {
  runId: 'mine_1',
  model: null,
  promptVersion: 'mine.v1',
  inputHash: 'c'.repeat(64),
  now: NOW,
});

beforeEach(clearFirestore);
afterAll(() => db.terminate());

describe('FirestorePatternProposalStore', () => {
  it('creates once and never resets a proposal the owner decided', async () => {
    expect(await store.create(proposal)).toBe(true);
    await db
      .collection('patternProposals')
      .doc(proposal.proposal_id)
      .update({ status: 'rejected' });
    expect(await store.create(proposal)).toBe(false);
    const snap = await db.collection('patternProposals').doc(proposal.proposal_id).get();
    expect(snap.get('status')).toBe('rejected');
    expect(await store.existing([proposal.proposal_id, 'pp_none'])).toEqual(
      new Set([proposal.proposal_id]),
    );
  });

  it('lists waiting proposals and expires overdue ones', async () => {
    await store.create(proposal);
    expect(await store.openPatternIds(NOW)).toEqual(new Set([c.pattern_id]));
    expect(await store.openPatternIds(LATER)).toEqual(new Set());
    const snap = await db.collection('patternProposals').doc(proposal.proposal_id).get();
    expect(snap.get('status')).toBe('expired');
  });

  it('reads the live library ids, and ignores a library whose hash does not match', async () => {
    const live = {
      ...proposal.pattern,
      status: 'approved' as const,
      approved_by: 'u1',
      approved_at: NOW.toISOString(),
    };
    const lib = sealLibrary(1, [live], sha256Hex);
    await db.collection('riskPatternLibrary').doc('current').set(lib);
    expect(await store.livePatternIds()).toEqual(new Set([c.pattern_id]));
    await db
      .collection('riskPatternLibrary')
      .doc('current')
      .set({ ...lib, content_hash: 'f'.repeat(64) });
    expect(await store.livePatternIds()).toEqual(new Set());
  });
});

describe('FirestoreAgentRunStore', () => {
  it('writes one envelope per agent and run, with a Timestamp for the TTL policy', async () => {
    const runs = new FirestoreAgentRunStore(db);
    const e = envelope({
      agent: 'miner',
      runId: 'mine_1',
      trigger: 'manual',
      startedAt: NOW,
      finishedAt: NOW,
      status: 'skipped',
      model: null,
      promptVersion: 'mine.v1',
      inputHash: 'c'.repeat(64),
      toolCalls: 0,
      usage: NO_USAGE,
      outputs: 0,
      outputRef: null,
      note: 'miner switched off',
    });
    await runs.save(e);
    await runs.save(e);
    const snap = await db.collection(AGENT_RUNS_COLLECTION).get();
    expect(snap.docs.map((d) => d.id)).toEqual(['miner_mine_1']);
    const expiresAt: unknown = snap.docs[0]?.get('expiresAt');
    expect(expiresAt).toBeInstanceOf(Timestamp);
    expect(expiresAt instanceof Timestamp && expiresAt.toDate().toISOString()).toBe(e.expires_at);
  });
});
