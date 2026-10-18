import type { InvestigationRatio } from '@fund-tracker/shared';
import type { ApplicationData, BorrowerType } from '../domain/schemas.js';
import { formatMoney } from './format.js';
import { parseAreaToHectares } from './land.js';

/**
 * Ratios the AI investigator may quote (docs/AI_INVESTIGATOR.md). Code computes every number; the
 * model never does arithmetic, and a claim that writes a number not in its cited evidence is rejected.
 * A ratio is left out when an input is missing or zero. Values are display strings, not stored money.
 */

/** No interest rate is recorded on an application, so the EMI uses this stated assumption. */
export const ASSUMED_ANNUAL_RATE_PERCENT = 12;
const ACRES_PER_HECTARE = 2.4710538;
const BUSINESS: ReadonlySet<BorrowerType> = new Set([
  'proprietorship',
  'partnership',
  'private_limited',
]);

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const times = (x: number): string => `${x.toFixed(2)} times`;
const positive = (n: number | null): n is number => n !== null && n > 0;

/** Equal monthly instalment in minor units (display only; rounded to the rupee). */
export function emiMinor(principalMinor: number, months: number, annualPercent: number): number {
  const r = annualPercent / 100 / 12;
  const f = (1 + r) ** months;
  return Math.round((principalMinor * r * f) / (f - 1) / 100) * 100;
}

function incomeRatios(d: ApplicationData, business: boolean): InvestigationRatio[] {
  const { amountMinor: loan, tenureMonths: months } = d.loan;
  const income = d.financial.declaredAnnualIncomeMinor;
  const debts = d.financial.existingLiabilitiesMinor;
  if (!positive(income)) return [];
  const what = business ? 'declared annual income / turnover' : 'declared annual income';
  const out: InvestigationRatio[] = [];
  if (positive(loan))
    out.push({
      name: business ? 'loan_to_turnover' : 'loan_to_income',
      label: business ? 'Loan to turnover' : 'Loan to annual income',
      value: times(loan / income),
      basis: `Loan amount ${formatMoney(loan)} ÷ ${what} ${formatMoney(income)}`,
    });
  if (positive(loan) && positive(months)) {
    const emi = emiMinor(loan, months, ASSUMED_ANNUAL_RATE_PERCENT);
    out.push({
      name: 'emi_to_monthly_income',
      label: 'EMI to monthly income',
      value: pct(emi / (income / 12)),
      basis: `EMI ${formatMoney(emi)} over ${String(months)} months at an assumed ${String(ASSUMED_ANNUAL_RATE_PERCENT)}% a year (no rate on the application) ÷ one twelfth of the ${what}`,
    });
  }
  if (positive(debts))
    out.push({
      name: 'liabilities_to_income',
      label: 'Existing liabilities to annual income',
      value: pct(debts / income),
      basis: `Existing liabilities ${formatMoney(debts)} ÷ ${what} ${formatMoney(income)}`,
    });
  return out;
}

function collateralRatios(d: ApplicationData): InvestigationRatio[] {
  const loan = d.loan.amountMinor;
  if (!positive(loan)) return [];
  const out: InvestigationRatio[] = [];
  const value = d.collateral.collateralValueMinor;
  if (positive(value))
    out.push({
      name: 'loan_to_collateral',
      label: 'Loan to collateral value',
      value: pct(loan / value),
      basis: `Loan amount ${formatMoney(loan)} ÷ collateral value ${formatMoney(value)}`,
    });
  const ha = parseAreaToHectares(d.collateral.landArea, d.collateral.landUnit);
  if (ha !== null && ha > 0) {
    const acres = ha * ACRES_PER_HECTARE;
    out.push({
      name: 'loan_per_acre',
      label: 'Loan per acre of land offered',
      value: formatMoney(Math.round(loan / acres / 100) * 100),
      basis: `Loan amount ${formatMoney(loan)} ÷ ${acres.toFixed(2)} acres (land area as entered)`,
    });
  }
  return out;
}

function receivableRatios(d: ApplicationData): InvestigationRatio[] {
  const owed = d.receivables.customers
    .map((c) => c.outstandingMinor)
    .filter((n): n is number => positive(n));
  if (owed.length === 0) return [];
  const total = owed.reduce((a, b) => a + b, 0);
  const out: InvestigationRatio[] = [
    {
      name: 'largest_customer_share',
      label: "Largest customer's share of declared receivables",
      value: pct(Math.max(...owed) / total),
      basis: `Largest outstanding ÷ total outstanding ${formatMoney(total)} across ${String(owed.length)} customer(s)`,
    },
  ];
  const loan = d.loan.amountMinor;
  if (positive(loan))
    out.push({
      name: 'receivables_to_loan',
      label: 'Declared receivables to loan amount',
      value: pct(total / loan),
      basis: `Total outstanding ${formatMoney(total)} ÷ loan amount ${formatMoney(loan)}`,
    });
  return out;
}

export function investigationRatios(
  d: ApplicationData,
  borrowerType: BorrowerType,
): InvestigationRatio[] {
  return [
    ...incomeRatios(d, BUSINESS.has(borrowerType)),
    ...collateralRatios(d),
    ...receivableRatios(d),
  ];
}
