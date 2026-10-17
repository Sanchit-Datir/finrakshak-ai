import { describe, expect, it } from 'vitest';
import {
  EXPLANATION_MAX_CHARS,
  RiskExplanationDocSchema,
  type RiskExplanationDoc,
} from './explanation.js';

const doc = (over: Partial<RiskExplanationDoc> = {}): RiskExplanationDoc => ({
  alert_id: 'a_1',
  loan_id: 'L-1',
  branch_id: 'B-1',
  run_id: 'run_1',
  text: 'Since the last check a public record names the borrower (an allegation, not a finding).',
  model: 'gemini-3.1-flash-lite',
  prompt_version: 'explain.v1',
  input_hash: 'b'.repeat(64),
  created_at: '2026-10-17T10:00:00.000Z',
  synthetic: true,
  ...over,
});

describe('RiskExplanationDoc', () => {
  it('accepts a valid explanation', () => {
    expect(RiskExplanationDocSchema.safeParse(doc()).success).toBe(true);
  });

  it('rejects verdict words, over-long text, real data and a missing model', () => {
    expect(RiskExplanationDocSchema.safeParse(doc({ text: 'This is fraud.' })).success).toBe(false);
    expect(
      RiskExplanationDocSchema.safeParse(doc({ text: 'x'.repeat(EXPLANATION_MAX_CHARS + 1) }))
        .success,
    ).toBe(false);
    expect(RiskExplanationDocSchema.safeParse({ ...doc(), synthetic: false }).success).toBe(false);
    expect(RiskExplanationDocSchema.safeParse({ ...doc(), model: '' }).success).toBe(false);
  });
});
