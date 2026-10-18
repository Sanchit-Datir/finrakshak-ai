/** Form state and validation for the application review step. Pure, so it is unit-tested. */

import type { ApplicationData, BorrowerType } from '../domain/schemas.js';
import { minorToRupeeInput, parseRupeesToMinor } from './format.js';
import { parseCustomerRows, type CustomerRow } from './receivables.js';

/** Rupee amounts as typed, kept as text until the form is saved (B-01: parsed to paise). */
export interface MoneyInputs {
  amount: string;
  income: string;
  liabilities: string;
  collateral: string;
}

export type ReviewErrorKey =
  'fullName' | 'amount' | 'purpose' | 'income' | 'liabilities' | 'collateral' | 'pan' | 'customers';

export type ReviewErrors = Partial<Record<ReviewErrorKey, string>>;

export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;

/** Borrower types that fill the business and receivables sections. */
export const BUSINESS_TYPES: ReadonlySet<BorrowerType> = new Set([
  'proprietorship',
  'partnership',
  'private_limited',
  'other',
]);

export function moneyOf(d: ApplicationData): MoneyInputs {
  return {
    amount: minorToRupeeInput(d.loan.amountMinor),
    income: minorToRupeeInput(d.financial.declaredAnnualIncomeMinor),
    liabilities: minorToRupeeInput(d.financial.existingLiabilitiesMinor),
    collateral: minorToRupeeInput(d.collateral.collateralValueMinor),
  };
}

export interface ReviewFormInput {
  data: ApplicationData;
  money: MoneyInputs;
  customerRows: CustomerRow[];
  /** Continuing to risk analysis (true) or saving a draft (false). */
  strict: boolean;
  /** Name, amount and purpose are required on the form path; the upload path needs nothing. */
  requireCoreFields: boolean;
}

export interface ReviewFormResult {
  /** The data to save, or null when a field needs fixing. */
  data: ApplicationData | null;
  errors: ReviewErrors;
  /** Errors per receivables row, by row index. */
  customerErrors: Record<number, string>;
}

export function validateReviewForm(input: ReviewFormInput): ReviewFormResult {
  const { data, money } = input;
  const core = input.strict && input.requireCoreFields;
  const e: ReviewErrors = {};
  const parse = (raw: string, key: ReviewErrorKey, required: boolean): number | null => {
    if (raw.trim() === '') {
      if (required) e[key] = 'Enter an amount.';
      return null;
    }
    const v = parseRupeesToMinor(raw);
    if (v === null) e[key] = 'Enter rupees using digits only, e.g. 150000 or 1,50,000.50';
    return v;
  };
  const amount = parse(money.amount, 'amount', core);
  const income = parse(money.income, 'income', false);
  const liabilities = parse(money.liabilities, 'liabilities', false);
  const collateral = parse(money.collateral, 'collateral', false);
  if (core && data.applicant.fullName.trim() === '') e.fullName = 'Enter the applicant name.';
  if (core && data.loan.purpose.trim() === '') e.purpose = 'Enter the declared loan purpose.';
  if (data.business.pan !== '' && !PAN_PATTERN.test(data.business.pan))
    e.pan = 'Enter a 10-character PAN, e.g. ABCDE1234F, or leave it blank.';
  const parsed = parseCustomerRows(input.customerRows);
  if (Object.keys(parsed.errors).length > 0) e.customers = 'Fix the highlighted customer rows.';
  const valid: ApplicationData = {
    ...data,
    loan: { ...data.loan, amountMinor: amount },
    financial: {
      ...data.financial,
      declaredAnnualIncomeMinor: income,
      existingLiabilitiesMinor: liabilities,
    },
    collateral: { ...data.collateral, collateralValueMinor: collateral },
    receivables: { customers: parsed.customers },
  };
  return {
    data: Object.keys(e).length > 0 ? null : valid,
    errors: e,
    customerErrors: parsed.errors,
  };
}
