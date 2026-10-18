import { PatternProposalSchema } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { patternProposalId, planProposals, toPatternProposal } from './proposals.js';
import { MemoryPatternProposalStore } from './store.js';
import { plantedContext } from './testing.js';
import { templatedWording } from './wording.js';

const ctx = plantedContext();
const c = ctx.result.candidates[0];
if (c === undefined) throw new Error('the planted pattern must be found');
const NOW = new Date('2026-10-17T10:00:00.000Z');
const meta = {
  runId: 'run_1',
  model: 'test-model',
  promptVersion: 'mine.v1',
  inputHash: 'c'.repeat(64),
  now: NOW,
};
const none = { worded: new Map(), rejected: new Map() };
const empty = { live: new Set<string>(), open: new Set<string>() };

describe('toPatternProposal (PATTERN_CONTRACT.md, section 5)', () => {
  const p = toPatternProposal(c, templatedWording(c), meta);

  it('copies the definition and every number from the candidate', () => {
    expect(PatternProposalSchema.safeParse(p).success).toBe(true);
    expect(p.pattern.definition).toEqual(c.definition);
    expect(p.candidate).toEqual(c.stats);
    expect(p.pattern.support).toEqual({
      basis: 'mined',
      supporting_case_ids: ['s1', 's2', 's3', 's4'],
      supporting_case_count: 4,
      population: { n: 40, follow_on: 30, lift: 1.618 },
      median_gap_months: 6,
    });
  });

  it('is a waiting draft from the miner that expires after 30 days', () => {
    expect(p).toMatchObject({
      status: 'proposed',
      decided_at: null,
      expires_at: '2026-11-16T10:00:00.000Z',
      pattern: { status: 'draft', origin: 'miner', approved_by: null },
    });
  });

  it('has a deterministic id per candidate and input', () => {
    expect(p.proposal_id).toBe(patternProposalId(c.pattern_id, meta.inputHash));
    expect(patternProposalId(c.pattern_id, 'd'.repeat(64))).not.toBe(p.proposal_id);
  });
});

describe('planProposals', () => {
  it('uses the model words with its id, or the templated words with model null', () => {
    const worded = new Map([
      [c.pattern_id, { ...templatedWording(c), name: 'ED search then CIRP' }],
    ]);
    const byModel = planProposals(ctx.result, { worded, rejected: new Map() }, empty, {
      ...meta,
      maxProposals: 5,
    });
    expect(byModel.proposals[0]).toMatchObject({
      model: 'test-model',
      pattern: { name: 'ED search then CIRP' },
    });
    const templated = planProposals(ctx.result, none, empty, { ...meta, maxProposals: 5 });
    expect(templated.proposals[0]?.model).toBeNull();
  });

  it('skips live, waiting and model-rejected candidates, and applies the cap', () => {
    const plan = (
      known = empty,
      agent = none,
      maxProposals = 5,
    ): ReturnType<typeof planProposals> =>
      planProposals(ctx.result, agent, known, { ...meta, maxProposals });
    expect(plan({ ...empty, live: new Set([c.pattern_id]) }).skipped.live).toBe(1);
    expect(plan({ ...empty, open: new Set([c.pattern_id]) }).skipped.open).toBe(1);
    const rejected = { worded: new Map(), rejected: new Map([[c.pattern_id, 'routine']]) };
    expect(plan(empty, rejected).skipped.rejected).toBe(1);
    expect(plan(empty, none, 0)).toMatchObject({ proposals: [], skipped: { over_cap: 1 } });
  });
});

describe('MemoryPatternProposalStore (same contract as Firestore)', () => {
  it('creates once, reports existing ids and expires overdue proposals', async () => {
    const store = new MemoryPatternProposalStore();
    const p = toPatternProposal(c, templatedWording(c), meta);
    expect(await store.create(p)).toBe(true);
    expect(await store.create(p)).toBe(false);
    expect(await store.existing([p.proposal_id, 'pp_other'])).toEqual(new Set([p.proposal_id]));
    expect(await store.openPatternIds(NOW)).toEqual(new Set([c.pattern_id]));
    expect(await store.openPatternIds(new Date('2026-11-17T00:00:00.000Z'))).toEqual(new Set());
    expect(store.proposals.get(p.proposal_id)?.status).toBe('expired');
  });
});
