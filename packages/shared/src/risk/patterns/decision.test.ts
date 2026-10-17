import { describe, expect, it } from 'vitest';
import { PatternDecisionSchema, patternLibraryVersionDoc } from './decision.js';

describe('PatternDecision (decidePattern input)', () => {
  it('approves or rejects a proposal and retires a pattern', () => {
    expect(
      PatternDecisionSchema.safeParse({ decision: 'approve', proposalId: 'pp_1' }).success,
    ).toBe(true);
    expect(
      PatternDecisionSchema.safeParse({ decision: 'reject', proposalId: 'pp_1' }).success,
    ).toBe(true);
    expect(
      PatternDecisionSchema.safeParse({ decision: 'retire', patternId: 'pat_0123456789abcdef' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown decisions, mixed fields, bad ids and extra fields', () => {
    for (const bad of [
      { decision: 'auto_approve', proposalId: 'pp_1' },
      { decision: 'retire', proposalId: 'pp_1' },
      { decision: 'approve', proposalId: 'has space' },
      { decision: 'retire', patternId: 'pat_short' },
      { decision: 'approve', proposalId: 'pp_1', by: 'agent' },
    ])
      expect(PatternDecisionSchema.safeParse(bad).success).toBe(false);
  });

  it('names the immutable library copies', () => {
    expect(patternLibraryVersionDoc(3)).toBe('v3');
  });
});
