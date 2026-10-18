import { MAX_TRADE_CUSTOMERS, type TradeCustomer } from '../domain/schemas.js';
import { minorToRupeeInput, parseRupeesToMinor } from './format.js';

/** Editable rows for the trade-receivables section (strings while typing). */
export interface CustomerRow {
  name: string;
  cin: string;
  outstanding: string;
  oldestUnpaidDate: string;
}

export const MAX_CUSTOMER_NAME = 200;
const CIN_INPUT = /^([LUF]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|[A-Z]{3}-\d{4})$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const emptyCustomerRow = (): CustomerRow => ({
  name: '',
  cin: '',
  outstanding: '',
  oldestUnpaidDate: '',
});

export function rowsOf(customers: readonly TradeCustomer[]): CustomerRow[] {
  return customers.map((c) => ({
    name: c.name,
    cin: c.cin,
    outstanding: minorToRupeeInput(c.outstandingMinor),
    oldestUnpaidDate: c.oldestUnpaidDate,
  }));
}

const isBlank = (r: CustomerRow): boolean =>
  [r.name, r.cin, r.outstanding, r.oldestUnpaidDate].every((v) => v.trim() === '');

function rowError(r: CustomerRow, cin: string): string | null {
  if (r.name.trim() === '') return 'Enter the customer name or clear the row.';
  if (r.name.trim().length > MAX_CUSTOMER_NAME)
    return `Use at most ${MAX_CUSTOMER_NAME} characters.`;
  if (cin !== '' && !CIN_INPUT.test(cin))
    return 'Enter a 21-character CIN (e.g. U27100MH1995PTC090840) or LLPIN, or leave it blank.';
  if (r.outstanding.trim() !== '' && parseRupeesToMinor(r.outstanding) === null)
    return 'Enter the outstanding amount in rupees using digits, e.g. 1800000.';
  if (r.oldestUnpaidDate !== '' && !ISO_DAY.test(r.oldestUnpaidDate))
    return 'Enter a valid date for the oldest unpaid invoice.';
  return null;
}

/** Validates rows (blank rows are dropped); errors are keyed by row index. */
export function parseCustomerRows(rows: readonly CustomerRow[]): {
  customers: TradeCustomer[];
  errors: Record<number, string>;
} {
  const customers: TradeCustomer[] = [];
  const errors: Record<number, string> = {};
  rows.slice(0, MAX_TRADE_CUSTOMERS).forEach((r, i) => {
    if (isBlank(r)) return;
    const cin = r.cin.trim().toUpperCase();
    const err = rowError(r, cin);
    if (err !== null) {
      errors[i] = err;
      return;
    }
    const outstandingMinor = r.outstanding.trim() === '' ? null : parseRupeesToMinor(r.outstanding);
    customers.push({
      name: r.name.trim(),
      cin,
      outstandingMinor,
      oldestUnpaidDate: r.oldestUnpaidDate,
    });
  });
  return { customers, errors };
}

export interface ReceivablesImpact {
  readonly totalMinor: number;
  readonly affectedMinor: number;
  readonly eligibleMinor: number;
  /** Whole percent of declared receivables owed by affected customers. */
  readonly affectedPercent: number;
}

/** Sums in integer paise with overflow checks (B-01, B-03); null if a total is unsafe. */
export function receivablesImpact(
  customers: readonly TradeCustomer[],
  isAffected: (c: TradeCustomer) => boolean,
): ReceivablesImpact | null {
  let total = 0;
  let affected = 0;
  for (const c of customers) {
    const amount = c.outstandingMinor ?? 0;
    total += amount;
    if (isAffected(c)) affected += amount;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(affected)) return null;
  }
  const affectedPercent = total === 0 ? 0 : Math.round((affected * 100) / total);
  return {
    totalMinor: total,
    affectedMinor: affected,
    eligibleMinor: total - affected,
    affectedPercent,
  };
}
