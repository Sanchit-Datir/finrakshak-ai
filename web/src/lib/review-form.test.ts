import { describe, expect, it } from 'vitest';
import { newApplicationData } from '../demo/seed.js';
import type { ApplicationData } from '../domain/schemas.js';
import { moneyOf, validateReviewForm, type MoneyInputs } from './review-form.js';

const blankMoney: MoneyInputs = { amount: '', income: '', liabilities: '', collateral: '' };

function filled(): ApplicationData {
  const d = newApplicationData();
  return {
    ...d,
    applicant: { ...d.applicant, fullName: 'Test Applicant' },
    loan: { ...d.loan, purpose: 'Drip irrigation' },
  };
}

const run = (
  data: ApplicationData,
  money: Partial<MoneyInputs>,
  strict = true,
  requireCoreFields = true,
): ReturnType<typeof validateReviewForm> =>
  validateReviewForm({
    data,
    money: { ...blankMoney, ...money },
    customerRows: [],
    strict,
    requireCoreFields,
  });

describe('validateReviewForm', () => {
  it('parses rupee inputs to integer paise (B-01)', () => {
    const r = run(filled(), { amount: '1,50,000.50', income: '240000', collateral: '₹ 5,00,000' });
    expect(r.errors).toEqual({});
    expect(r.data?.loan.amountMinor).toBe(15_000_050);
    expect(r.data?.financial.declaredAnnualIncomeMinor).toBe(24_000_000);
    expect(r.data?.collateral.collateralValueMinor).toBe(50_000_000);
    expect(r.data?.financial.existingLiabilitiesMinor).toBeNull();
  });

  it('rejects malformed amounts without losing the rest (boundary: malformed)', () => {
    const r = run(filled(), { amount: '12.345', income: 'abc', liabilities: '-5' });
    expect(r.data).toBeNull();
    expect(Object.keys(r.errors).sort()).toEqual(['amount', 'income', 'liabilities']);
  });

  it('requires name, amount and purpose only when continuing on the form path', () => {
    const empty = newApplicationData();
    expect(Object.keys(run(empty, {}).errors).sort()).toEqual(['amount', 'fullName', 'purpose']);
    expect(run(empty, {}, false).errors).toEqual({});
    expect(run(empty, {}, true, false).errors).toEqual({});
  });

  it('accepts a blank PAN and rejects a malformed one', () => {
    const d = filled();
    expect(run(d, { amount: '1000' }).errors.pan).toBeUndefined();
    const bad = { ...d, business: { ...d.business, pan: 'ABCDE12345' } };
    expect(run(bad, { amount: '1000' }).errors.pan).toMatch(/10-character PAN/);
    const good = { ...d, business: { ...d.business, pan: 'ABCDE1234F' } };
    expect(run(good, { amount: '1000' }).errors.pan).toBeUndefined();
  });

  it('reports invalid receivables rows by index', () => {
    const r = validateReviewForm({
      data: filled(),
      money: { ...blankMoney, amount: '1000' },
      customerRows: [{ name: 'Buyer', cin: 'not-a-cin', outstanding: '100', oldestUnpaidDate: '' }],
      strict: true,
      requireCoreFields: true,
    });
    expect(r.data).toBeNull();
    expect(r.errors.customers).toBeDefined();
    expect(Object.keys(r.customerErrors)).toEqual(['0']);
  });
});

describe('moneyOf', () => {
  it('round-trips stored paise back into editable rupee text', () => {
    const r = run(filled(), { amount: '150000.5' });
    expect(r.data).not.toBeNull();
    if (r.data === null) return;
    expect(validateReviewForm({ ...input(r.data), strict: true }).data?.loan.amountMinor).toBe(
      15_000_050,
    );
  });
});

function input(data: ApplicationData): Parameters<typeof validateReviewForm>[0] {
  return { data, money: moneyOf(data), customerRows: [], strict: false, requireCoreFields: true };
}
