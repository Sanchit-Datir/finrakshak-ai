import type { AgentProposal } from '@fund-tracker/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshFsStore } from '../test/tempData.js';
import {
  flagsFromProposals,
  markApplied,
  persistDrafts,
  proposalId,
  PROPOSAL_TTL_MS,
  toProposal,
} from './proposals.js';
import { BlobAgentStore } from './store.js';

const NOW = new Date('2026-10-17T03:30:00.000Z');
const proposal = (over: Partial<AgentProposal>): AgentProposal => ({
  ...toProposal(
    'run_1',
    { source_id: 'ibbi', action: 'full_relist', reason: 'because', auto: false },
    NOW,
  ),
  ...over,
});

beforeEach(() => {
  freshFsStore();
});

describe('proposals', () => {
  it('have deterministic ids per run, source and action', () => {
    expect(proposalId('run_1', { source_id: 'ibbi', action: 'full_relist' })).toBe(
      proposalId('run_1', { source_id: 'ibbi', action: 'full_relist' }),
    );
    expect(proposalId('run_1', { source_id: 'ibbi', action: 'full_relist' })).not.toBe(
      proposalId('run_2', { source_id: 'ibbi', action: 'full_relist' }),
    );
    expect(proposalId('run_1', { source_id: null, action: 'rollback_publish' })).toMatch(
      /^p_[0-9a-f]{24}$/,
    );
  });

  it('are created as proposed, or auto-approved by the agent itself', () => {
    expect(proposal({})).toMatchObject({
      status: 'proposed',
      decided_by: null,
      expires_at: new Date(NOW.getTime() + PROPOSAL_TTL_MS).toISOString(),
    });
    expect(
      toProposal(
        'run_1',
        { source_id: 'ibbi', action: 'rerun_source', reason: 'x', auto: true },
        NOW,
      ),
    ).toMatchObject({ status: 'auto_approved', decided_by: 'agent' });
  });

  it('are not duplicated while one is open for the same source and action, and expire', async () => {
    const store = new BlobAgentStore();
    const draft = {
      source_id: 'ibbi' as const,
      action: 'full_relist' as const,
      reason: 'quiet',
      auto: false,
    };
    expect(await persistDrafts(store, 'run_1', [draft, draft], NOW)).toHaveLength(1);
    expect(await persistDrafts(store, 'run_2', [draft], NOW)).toHaveLength(0);
    const later = new Date(NOW.getTime() + PROPOSAL_TTL_MS + 1);
    const created = await persistDrafts(store, 'run_9', [draft], later);
    expect(created).toHaveLength(1);
    expect((await store.openProposals()).map((p) => p.run_id)).toEqual(['run_9']);
  });

  it('turn approved proposals into one-run flags; pauses stay in force', () => {
    const open = [
      proposal({ status: 'approved', action: 'full_relist' }),
      proposal({ status: 'approved', action: 'accept_shrink', source_id: 'nfra' }),
      proposal({ status: 'approved', action: 'pause_source', source_id: 'rbi' }),
      proposal({ status: 'proposed', action: 'full_relist', source_id: 'ed' }),
      proposal({ status: 'approved', action: 'rollback_publish', source_id: null }),
    ];
    expect(flagsFromProposals(open)).toEqual({
      ibbi: { forceFull: true },
      nfra: { allowShrink: true },
      rbi: { skip: true },
    });
  });

  it('mark one-shot actions applied but leave pauses approved', async () => {
    const store = new BlobAgentStore();
    const once = proposal({ status: 'approved' });
    const pause = proposal({ id: 'p_pause', status: 'approved', action: 'pause_source' });
    await store.createProposal(once);
    await store.createProposal(pause);
    await markApplied(store, [once, pause], 'run_2');
    const open = await store.openProposals();
    expect(open.map((p) => p.action)).toEqual(['pause_source']);
  });
});
