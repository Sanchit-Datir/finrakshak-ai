import { istDate } from '../../time.js';
import type { RuleTransaction } from '../rules/types.js';
import { addMonths, daysBetween } from './calc.js';

/**
 * The loan's EMI history, worked out from its repayments (the loan rows carry no schedule; the owner's
 * answer to question 3 of the scorer brief). EMIs fall due monthly from the disbursement day. The usual
 * EMI is the most common repayment amount (the larger on a tie). Repayments pay the oldest EMI first,
 * as a bank applies them. The schedule ends once repayments reach the loan amount, because the tenor is
 * not in the data. Money is compared in integer minor units only (B-01, B-03).
 *
 * With `prepaymentMinMultiple` set (settings v3 on), a repayment of at least that many usual EMIs made
 * while no EMI is past its grace period unpaid is a prepayment: it pays no EMI slot, it counts towards
 * the loan amount, and the usual EMI is worked out again from the repayments after it (the EMIs shrink).
 * A large repayment while an EMI is overdue stays a catch-up payment, so a missed EMI is never hidden.
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
  /** Null: no repayment is treated as a prepayment (settings v1 and v2). */
  readonly prepaymentMinMultiple: number | null;
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

/** EMIs past their grace period on `day` (EMI 1 is due one month after disbursement). */
function overdueBy(loan: EmiLoan, day: string, graceDays: number): number {
  let n = 0;
  while (daysBetween(addMonths(loan.disbursedOn, n + 1), day) > graceDays) n++;
  return n;
}

interface Paired {
  readonly txn: RuleTransaction;
  readonly segment: number;
}

interface Split {
  /** Repayments that pay an EMI slot, oldest first, with the segment their usual EMI comes from. */
  readonly paired: readonly Paired[];
  readonly prepayments: readonly RuleTransaction[];
  /** The usual EMI of each segment (a new segment starts after each prepayment). */
  readonly usual: readonly (number | null)[];
}

const isPrepayment = (
  t: RuleTransaction,
  usual: number | null,
  ctx: { loan: EmiLoan; rules: EmiRules; paidSlots: number },
): boolean => {
  const multiple = ctx.rules.prepaymentMinMultiple;
  if (multiple === null || usual === null) return false;
  const threshold = usual * multiple;
  if (!Number.isSafeInteger(threshold)) throw new RangeError(`EMI overflow on ${ctx.loan.id}`);
  if (t.amountMinor < threshold) return false;
  return overdueBy(ctx.loan, istDate(t.at), ctx.rules.graceDays) <= ctx.paidSlots;
};

function splitRepayments(
  loan: EmiLoan,
  repayments: readonly RuleTransaction[],
  rules: EmiRules,
): Split {
  const segments: number[][] = [[]];
  const paired: Paired[] = [];
  const prepayments: RuleTransaction[] = [];
  for (const t of repayments) {
    const current = segments[segments.length - 1] ?? [];
    if (isPrepayment(t, usualAmount(current), { loan, rules, paidSlots: paired.length })) {
      prepayments.push(t);
      segments.push([]);
      continue;
    }
    current.push(t.amountMinor);
    paired.push({ txn: t, segment: segments.length - 1 });
  }
  return { paired, prepayments, usual: segments.map(usualAmount) };
}

const addMinor = (loan: EmiLoan, a: number, b: number): number => {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new RangeError(`Repayments overflow on ${loan.id}`);
  return total;
};

/** Prepayments made before `due`, in minor units. */
const prepaidBefore = (loan: EmiLoan, split: Split, due: string): number =>
  split.prepayments
    .filter((t) => istDate(t.at) < due)
    .reduce((sum, t) => addMinor(loan, sum, t.amountMinor), 0);

/** Every EMI due on or before `asOf`, oldest first. */
export function emiHistory(
  loan: EmiLoan,
  txns: readonly RuleTransaction[],
  asOf: string,
  rules: EmiRules,
): EmiState[] {
  const split = splitRepayments(loan, repaymentsOf(loan, txns, asOf), rules);
  const out: EmiState[] = [];
  let slotsPaid = 0;
  for (let no = 1; ; no++) {
    const due = addMonths(loan.disbursedOn, no);
    if (due > asOf) break;
    if (addMinor(loan, slotsPaid, prepaidBefore(loan, split, due)) >= loan.amountMinor) break;
    const paid = split.paired[no - 1];
    const usual = paid === undefined ? null : (split.usual[paid.segment] ?? null);
    out.push(stateOf(no, due, paid?.txn, { asOf, usual, rules }));
    slotsPaid = addMinor(loan, slotsPaid, paid?.txn.amountMinor ?? 0);
  }
  return out;
}
