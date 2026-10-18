import { INVESTIGATION_LIMITS } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { BUNDLE } from './bundle.fixture.js';
import { LIMITS } from './input.js';
import {
  checkText,
  indexBundle,
  numbersIn,
  verifyFinding,
  verifyQuestion,
  verifySummary,
  type FindingClaim,
} from './verify.js';

const ix = indexBundle(BUNDLE);

const finding = (over: Partial<FindingClaim>): FindingClaim => ({
  kind: 'implausible_numbers',
  priority: 'needs_attention',
  statement: 'Loan per acre is ₹16,66,667, high for the land offered.',
  partyId: null,
  citations: [{ type: 'ratio', name: 'loan_per_acre' }],
  ...over,
});

const reasonOf = (claim: FindingClaim): string => {
  const v = verifyFinding(ix, claim, 'ai:1');
  return v.ok ? 'ok' : v.reason;
};

describe('runtime limits', () => {
  it('match the shared INVESTIGATION_LIMITS', () => {
    expect(LIMITS).toEqual(INVESTIGATION_LIMITS);
  });
});

describe('numbersIn', () => {
  it('reads Indian and western grouping the same way', () => {
    expect(numbersIn('₹25,00,000 and 2,500,000 and 1.5')).toEqual([2_500_000, 2_500_000, 1.5]);
  });
});

describe('field citations', () => {
  it('keeps a claim whose field path exists and whose quote is in the value', () => {
    const cites = [
      { type: 'field', path: 'loan.amount', quote: '25,00,000' },
      { type: 'field', path: 'collateral.landArea', quote: '1.5 acre' },
    ] as const;
    const claim = finding({
      kind: 'section_mismatch',
      statement: 'A loan of ₹25,00,000 against 1.5 acre.',
      citations: [...cites],
    });
    expect(reasonOf(claim)).toBe('ok');
  });

  it('rejects a field path that was not sent', () => {
    const citations = [{ type: 'field', path: 'loan.rate', quote: null }] as const;
    expect(reasonOf(finding({ citations: [...citations], statement: 'Rate looks odd.' }))).toBe(
      'unknown_field',
    );
  });

  it('rejects a quote that is not the field value', () => {
    const citations = [{ type: 'field', path: 'loan.amount', quote: '30,00,000' }] as const;
    expect(reasonOf(finding({ citations: [...citations], statement: 'Amount.' }))).toBe(
      'quote_mismatch',
    );
  });

  it('a section mismatch needs two fields', () => {
    const citations = [{ type: 'field', path: 'loan.amount', quote: null }] as const;
    const claim = finding({
      kind: 'section_mismatch',
      statement: 'Odd.',
      citations: [...citations],
    });
    expect(reasonOf(claim)).toBe('missing_evidence');
  });
});

describe('ratios and numbers', () => {
  it('rejects a ratio code did not send', () => {
    const claim = finding({ citations: [{ type: 'ratio', name: 'emi_to_income' }] });
    expect(reasonOf(claim)).toBe('unknown_ratio');
  });

  it('rejects a number the model computed itself', () => {
    expect(reasonOf(finding({ statement: 'Loan per acre is about ₹17,00,000.' }))).toBe(
      'unknown_number',
    );
  });

  it('allows a statement with no numbers', () => {
    expect(reasonOf(finding({ statement: 'Loan per acre looks high.' }))).toBe('ok');
  });
});

describe('public-record matches', () => {
  const match = (over: Partial<FindingClaim>): FindingClaim =>
    finding({
      kind: 'public_record_match',
      priority: 'urgent',
      statement: 'Possible match in public records; needs verification.',
      partyId: 'customer:0',
      citations: [{ type: 'record', id: 'org:2' }],
      ...over,
    });

  it('keeps a shortlisted candidate as a possible match capped at Needs attention', () => {
    const v = verifyFinding(ix, match({}), 'ai:1');
    expect(v.ok && v.value.match).toBe('possible');
    expect(v.ok && v.value.priority).toBe('needs_attention');
  });

  it('is strong only when the CIN also agrees', () => {
    const v = verifyFinding(
      ix,
      match({ partyId: 'business', citations: [{ type: 'record', id: 'ev:1' }] }),
      'ai:1',
    );
    expect(v.ok && v.value.match).toBe('strong');
    expect(v.ok && v.value.priority).toBe('urgent');
  });

  it("rejects a record from another party's shortlist", () => {
    expect(reasonOf(match({ citations: [{ type: 'record', id: 'org:1' }] }))).toBe(
      'not_in_shortlist',
    );
  });

  it('rejects an id that is in no shortlist', () => {
    expect(reasonOf(match({ citations: [{ type: 'record', id: 'org:999' }] }))).toBe(
      'unknown_record',
    );
  });

  it('rejects an unknown party and a match without a party', () => {
    expect(reasonOf(match({ partyId: 'customer:7' }))).toBe('unknown_party');
    expect(reasonOf(match({ partyId: null }))).toBe('missing_evidence');
  });
});

describe('related entities', () => {
  const link = (id: string): FindingClaim =>
    finding({
      kind: 'related_entity_link',
      statement: 'Linked to an entity in an open case.',
      partyId: 'customer:0',
      citations: [{ type: 'entity', id }],
    });

  it('keeps a link to an entity with a known concern', () => {
    expect(reasonOf(link('E-9'))).toBe('ok');
  });

  it('rejects a link to an entity with no known concern, or not in the bundle', () => {
    expect(reasonOf(link('E-10'))).toBe('missing_evidence');
    expect(reasonOf(link('E-404'))).toBe('unknown_entity');
  });
});

describe('wording', () => {
  it('blocks verdict words and stated scores', () => {
    expect(checkText('This looks like fraud.', [])).toBe('verdict_word');
    expect(checkText('The documents may be forged.', [])).toBe('verdict_word');
    expect(checkText('Risk score is high.', [])).toBe('stated_score');
    expect(checkText('About 70 out of 100.', [{ v: '70 100' }])).toBe('stated_score');
  });

  it('allows saying there is not enough evidence', () => {
    expect(verifySummary(ix, 'Not enough evidence to raise a lead.')).toBeNull();
  });

  it('rejects an over-long statement', () => {
    expect(reasonOf(finding({ statement: 'x'.repeat(LIMITS.maxTextChars + 1) }))).toBe(
      'over_limit',
    );
  });
});

describe('questions', () => {
  it('keeps a question about a sent field or a section', () => {
    for (const gap of ['loan.purpose', 'collateral'])
      expect(
        verifyQuestion(ix, { question: 'Please explain.', gap, citations: [] }, 'q:1').ok,
      ).toBe(true);
  });

  it('rejects a gap that is not in the bundle', () => {
    const v = verifyQuestion(ix, { question: 'Why?', gap: 'loan.rate', citations: [] }, 'q:1');
    expect(v.ok ? 'ok' : v.reason).toBe('unknown_field');
  });
});
