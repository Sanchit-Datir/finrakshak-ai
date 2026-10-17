import { describe, expect, it } from 'vitest';
import { claimRow, extractionRecord } from '../../test/aiFixtures.js';
import {
  AiClaimRowSchema,
  AiExtractionRecordSchema,
  CASE_TYPES,
  ModelExtractionSchema,
  ORG_ROLES,
  RECORD_CLAIMS_PARAMETERS,
} from './schema.js';

const VALID = {
  organisations: [
    {
      name: '  Example Finance Limited ',
      cin: 'L65910MH1990PLC012345',
      role: 'subject_of_action',
      page: 1,
    },
  ],
  amounts: [{ amount_text: 'Rs. 62.70 crore', about: 'penalty', page: 2 }],
  dates: [{ date: '2026-10-01', what: 'order date', page: null }],
  case_type: 'penalty',
  summary: 'SEBI imposed a penalty.',
};

const withOrg = (over: Record<string, unknown>): Record<string, unknown> => ({
  ...VALID,
  organisations: [{ ...VALID.organisations[0], ...over }],
});

describe('extraction schemas', () => {
  it('accepts a well-formed record_claims call and trims strings', () => {
    const parsed = ModelExtractionSchema.parse(VALID);
    expect(parsed.organisations[0]?.name).toBe('Example Finance Limited');
    expect(parsed.amounts[0]?.amount_text).toBe('Rs. 62.70 crore');
  });

  it('drops keys the model may not set, such as evidence status (B-36)', () => {
    const parsed = ModelExtractionSchema.parse({
      ...VALID,
      evidence_status: 'finding',
      amounts: [{ ...VALID.amounts[0], minor: 627, evidence_status: 'finding' }],
    });
    expect(parsed).not.toHaveProperty('evidence_status');
    expect(parsed.amounts[0]).toEqual({
      amount_text: 'Rs. 62.70 crore',
      about: 'penalty',
      page: 2,
    });
  });

  it.each([
    ['a missing case type', { ...VALID, case_type: undefined }],
    ['an unknown case type (no verdicts)', { ...VALID, case_type: 'guilty_verdict' }],
    ['an unknown role', withOrg({ role: 'accused' })],
    ['a name that is blank once trimmed', withOrg({ name: '   x ' })],
    ['a name over 200 characters', withOrg({ name: 'A'.repeat(201) })],
    ['a missing CIN field (null is required, not absent)', withOrg({ cin: undefined })],
    ['page 0', withOrg({ page: 0 })],
    ['a fractional page', withOrg({ page: 1.5 })],
    ['a page given as text', withOrg({ page: '1' })],
    ['an impossible date', { ...VALID, dates: [{ date: '2026-02-30', what: 'x', page: null }] }],
    [
      'a date with a time',
      { ...VALID, dates: [{ date: '2026-10-01T00:00:00Z', what: 'x', page: null }] },
    ],
    [
      'an amount text over 80 characters',
      { ...VALID, amounts: [{ ...VALID.amounts[0], amount_text: `Rs. ${'9'.repeat(80)}` }] },
    ],
    [
      'more than 40 organisations',
      { ...VALID, organisations: Array.from({ length: 41 }, () => VALID.organisations[0]) },
    ],
    [
      'more than 20 amounts',
      { ...VALID, amounts: Array.from({ length: 21 }, () => VALID.amounts[0]) },
    ],
    ['a summary over 400 characters', { ...VALID, summary: 'x'.repeat(401) }],
    ['null lists', { ...VALID, organisations: null }],
    ['free text instead of a call', 'Example Finance Limited was fined Rs. 62.70 crore.'],
    ['nothing at all', undefined],
  ])('rejects malformed model output: %s', (_label, input) => {
    expect(ModelExtractionSchema.safeParse(input).success).toBe(false);
  });

  it('accepts the list limits exactly (40 organisations, 20 amounts, 20 dates)', () => {
    const full = {
      ...VALID,
      organisations: Array.from({ length: 40 }, () => VALID.organisations[0]),
      amounts: Array.from({ length: 20 }, () => VALID.amounts[0]),
      dates: Array.from({ length: 20 }, () => VALID.dates[0]),
    };
    expect(ModelExtractionSchema.safeParse(full).success).toBe(true);
  });

  it('keeps the record_claims JSON Schema in step with the zod schema', () => {
    const p = RECORD_CLAIMS_PARAMETERS;
    const shape = ModelExtractionSchema.shape;
    const keys = (o: object): string[] => Object.keys(o).sort();
    expect([...p.required].sort()).toEqual(keys(shape));
    expect([...p.properties.organisations.items.required].sort()).toEqual(
      keys(shape.organisations.element.shape),
    );
    expect([...p.properties.amounts.items.required].sort()).toEqual(
      keys(shape.amounts.element.shape),
    );
    expect([...p.properties.dates.items.required].sort()).toEqual(keys(shape.dates.element.shape));
    expect(p.properties.organisations.items.properties.role.enum).toEqual(ORG_ROLES);
    expect(p.properties.case_type.enum).toEqual(CASE_TYPES);
    expect([
      p.properties.organisations.maxItems,
      p.properties.amounts.maxItems,
      p.properties.dates.maxItems,
    ]).toEqual([40, 20, 20]);
  });

  it('stores money only as safe integer paise on claim rows (B-01, B-03)', () => {
    const amount = (minor: number): unknown =>
      claimRow({ kind: 'amount', amount: { minor, currency: 'INR' } });
    expect(AiClaimRowSchema.safeParse(amount(62_700_000_000)).success).toBe(true);
    expect(AiClaimRowSchema.safeParse(amount(62.7)).success).toBe(false);
    expect(AiClaimRowSchema.safeParse(amount(Number.MAX_SAFE_INTEGER + 2)).success).toBe(false);
  });

  it('rejects claim rows with an unknown evidence status or a non-hex checksum', () => {
    expect(
      AiClaimRowSchema.safeParse({ ...claimRow({ kind: 'date' }), evidence_status: 'verdict' })
        .success,
    ).toBe(false);
    expect(AiExtractionRecordSchema.safeParse(extractionRecord()).success).toBe(true);
    expect(AiExtractionRecordSchema.safeParse(extractionRecord({ sha256: 'ABC' })).success).toBe(
      false,
    );
  });
});
