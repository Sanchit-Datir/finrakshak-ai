import { beforeEach, describe, expect, it } from 'vitest';
import { freshFsStore } from '../test/tempData.js';
import { toProposal } from './proposals.js';
import { BlobAgentStore } from './store.js';

beforeEach(() => {
  freshFsStore();
});

describe('BlobAgentStore', () => {
  it('creates a proposal once and lists only open ones', async () => {
    const store = new BlobAgentStore();
    const p = toProposal(
      'run_1',
      { source_id: 'ed', action: 'full_relist', reason: 'r', auto: false },
      new Date('2026-10-17T00:00:00Z'),
    );
    await store.createProposal(p);
    await store.createProposal({ ...p, reason: 'changed' });
    expect((await store.openProposals()).map((x) => x.reason)).toEqual(['r']);
    await store.updateProposal({ ...p, status: 'rejected' });
    expect(await store.openProposals()).toEqual([]);
  });

  it('refuses to save an invalid review', async () => {
    await expect(
      new BlobAgentStore().saveReview({
        run_id: '',
        status: 'healthy',
        summary: 'x',
        findings: [],
        proposals_created: 0,
        model: null,
        prompt_version: 'v',
        input_hash: 'nothex',
        tool_calls: 0,
        generated_at: '2026-10-17T00:00:00Z',
      }),
    ).rejects.toThrow();
  });
});
