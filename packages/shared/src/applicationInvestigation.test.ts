import { describe, expect, it } from 'vitest';
import {
  INVESTIGATION_LIMITS as L,
  InvestigateApplicationInputSchema,
  InvestigateApplicationResultSchema,
} from './applicationInvestigation.js';

const empty = {
  borrowerType: 'individual',
  sections: { applicant: [], business: [], loan: [], collateral: [], customers: [] },
  ratios: [],
  parties: [],
  findings: [],
};
const finding = {
  id: 'ai:1',
  kind: 'implausible_numbers',
  priority: 'routine',
  statement: 'Loan per acre looks high.',
  partyId: null,
  match: null,
  citations: [{ type: 'ratio', name: 'loan_per_acre' }],
};
const result = {
  mock: true,
  model: null,
  investigatedAt: '2026-10-18T06:00:00.000Z',
  summary: '',
  notEnoughEvidence: true,
  findings: [],
  questions: [],
  claims: { made: 0, verified: 0, rejected: 0 },
  rejections: [],
  toolCalls: 0,
  remainingToday: null,
};

describe('investigateApplication schemas', () => {
  it('accepts an empty bundle', () => {
    expect(InvestigateApplicationInputSchema.safeParse(empty).success).toBe(true);
  });

  it('rejects more parties or longer values than the limits', () => {
    const party = {
      partyId: 'p',
      role: 'customer',
      name: 'SYNTH',
      cin: '',
      candidates: [],
      related: [],
    };
    const parties = Array.from({ length: L.maxParties + 1 }, () => party);
    const long = { path: 'loan.purpose', label: 'Purpose', value: 'x'.repeat(L.maxValueChars + 1) };
    expect(InvestigateApplicationInputSchema.safeParse({ ...empty, parties }).success).toBe(false);
    const sections = { ...empty.sections, loan: [long] };
    expect(InvestigateApplicationInputSchema.safeParse({ ...empty, sections }).success).toBe(false);
  });

  it('requires a citation on every finding and caps kept findings', () => {
    const ok = { ...result, findings: [finding] };
    expect(InvestigateApplicationResultSchema.safeParse(ok).success).toBe(true);
    const uncited = { ...result, findings: [{ ...finding, citations: [] }] };
    expect(InvestigateApplicationResultSchema.safeParse(uncited).success).toBe(false);
    const many = { ...result, findings: Array.from({ length: L.maxFindings + 1 }, () => finding) };
    expect(InvestigateApplicationResultSchema.safeParse(many).success).toBe(false);
  });

  it('rejects an unknown citation type', () => {
    const bad = { ...result, findings: [{ ...finding, citations: [{ type: 'web', url: 'x' }] }] };
    expect(InvestigateApplicationResultSchema.safeParse(bad).success).toBe(false);
  });
});
