import { istDate } from '../../time.js';
import type { RuleTransaction } from '../rules/types.js';
import { addMonths, daysBetween } from './calc.js';

/**
 * The loan's EMI history, worked out from its repayments (the loan rows carry no schedule; the owner's
 * answer to question 3 of the scorer brief). EMIs fall due monthly from the disbursement day. The usual
 * EMI is the most common repayment amount (the larger on a tie). Repayments pay the oldest EMI first,
 * as a bank applies them. The schedule ends once repayments reach the loan amount, because the tenor is
 * not in the data. Money is compared in integer minor units only (B-01, B-03).
 */

export interface EmiState {
  /** 1 for the first EMI. */
  readonly no: number;
  readonly due: string;
  /** Null while unpaid. */
  readonly paidOn: string | null;
  readonly paidMinor: number;
  readonly transactionId: string | null;
  /** Days after the due date; 0 when paid on time or early. */
  readonly daysLate: number;
  readonly status: 'paid' | 'pending' | 'missed';
  readonly late: boolean;
  readonly partial: boolean;
}

export interface EmiRules {
  readonly graceDays: number;
  readonly partialBelowPercent: number;
}

export interface EmiLoan {
  readonly id: string;
  readonly amountMinor: number;
  /** IST day of disbursement. */
  readonly disbursedOn: string;
  readonly accountEntityId: string;
}

/** The most common amount; the larger on a tie; null when there is none. */
export function usualAmount(amounts: readonly number[]): number | null {
  const counts = new Map<number, number>();
  for (const a of amounts) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best: [number, number] | null = null;
  for (const [amount, n] of counts)
    if (best === null || n > best[1] || (n === best[1] && amount > best[0])) best = [amount, n];
  return best === null ? null : best[0];
}

const repaymentsOf = (
  loan: EmiLoan,
  txns: readonly RuleTransaction[],
  asOf: string,
): RuleTransaction[] =>
  txns
    .filter(
      (t) => t.type === 'repayment' && t.fromId === loan.accountEntityId && istDate(t.at) <= asOf,
    )
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

function stateOf(
  no: number,
  due: string,
  paid: RuleTransaction | undefined,
  ctx: { asOf: string; usual: number | null; rules: EmiRules },
): EmiState {
  if (paid === undefined) {
    const status = daysBetween(due, ctx.asOf) > ctx.rules.graceDays ? 'missed' : 'pending';
    const base = { no, due, paidOn: null, paidMinor: 0, transactionId: null };
    return { ...base, daysLate: 0, status, late: false, partial: false };
  }
  const paidOn = istDate(paid.at);
  const daysLate = Math.max(0, daysBetween(due, paidOn));
  const partial =
    ctx.usual !== null && paid.amountMinor * 100 < ctx.usual * ctx.rules.partialBelowPercent;
  return {
    no,
    due,
    paidOn,
    paidMinor: paid.amountMinor,
    transactionId: paid.id,
    daysLate,
    status: 'paid',
    late: daysLate > ctx.rules.graceDays,
    partial,
  };
}

/** Every EMI due on or before `asOf`, oldest first. */
export function emiHistory(
  loan: EmiLoan,
  txns: readonly RuleTransaction[],
  asOf: string,
  rules: EmiRules,
): EmiState[] {
  const repayments = repaymentsOf(loan, txns, asOf);
  const ctx = { asOf, usual: usualAmount(repayments.map((t) => t.amountMinor)), rules };
  const out: EmiState[] = [];
  let repaid = 0;
  for (let no = 1; repaid < loan.amountMinor; no++) {
    const due = addMonths(loan.disbursedOn, no);
    if (due > asOf) break;
    const paid = repayments[no - 1];
    out.push(stateOf(no, due, paid, ctx));
    repaid += paid?.amountMinor ?? 0;
    if (!Number.isSafeInteger(repaid)) throw new RangeError(`Repayments overflow on ${loan.id}`);
  }
  return out;
}
