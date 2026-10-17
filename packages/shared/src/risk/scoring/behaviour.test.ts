import { describe, expect, it } from 'vitest';
import type { RuleTransaction } from '../rules/types.js';
import { behaviourLayer, receiptsFallPercent, type BehaviourInput } from './behaviour.js';
import { addMonths } from './calc.js';
import { emiHistory, usualAmount } from './emi.js';
import { DEFAULT_SCORING_SETTINGS as S } from './settings.js';

const LOAN = { id: 'L-1', amountMinor: 1_200_000, disbursedOn: '2024-01-10', accountEntityId: 'A' };
const EMI = 100_000;
/** 14:00 IST on the given day. */
const at = (date: string): string => `${date}T08:30:00.000Z`;
const pay = (no: number, lateDays = 0, amount = EMI): RuleTransaction => {
  const due = addMonths(LOAN.disbursedOn, no);
  const d = new Date(`${due}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + lateDays);
  return {
    id: `R${no}`,
    at: at(d.toISOString().slice(0, 10)),
    fromId: 'A',
    toId: 'BANK',
    amountMinor: amount,
    type: 'repayment',
  };
};
const onTime = (from: number, to: number): RuleTransaction[] =>
  Array.from({ length: to - from + 1 }, (_, i) => pay(from + i));
const receipt = (id: string, date: string, amount: number): RuleTransaction => ({
  id,
  at: at(date),
  fromId: 'C',
  toId: 'A',
  amountMinor: amount,
  type: 'neft',
});
const run = (
  transactions: RuleTransaction[],
  asOf: string,
  loan = LOAN,
): ReturnType<typeof behaviourLayer> =>
  behaviourLayer({ loan, transactions, asOf } satisfies BehaviourInput, S);
const codes = (r: ReturnType<typeof behaviourLayer>): string[] => r.reasons.map((x) => x.code);

describe('EMI history', () => {
  it('takes the most common repayment as the usual EMI, the larger on a tie', () => {
    expect(usualAmount([5, 7, 7, 5])).toBe(7);
    expect(usualAmount([5, 5, 7])).toBe(5);
    expect(usualAmount([7, 5])).toBe(7);
    expect(usualAmount([])).toBeNull();
  });

  it('ends the schedule once repayments reach the loan amount', () => {
    const small = { ...LOAN, amountMinor: 3 * EMI };
    const h = emiHistory(small, onTime(1, 3), '2025-06-30', {
      graceDays: 5,
      partialBelowPercent: 90,
    });
    expect(h).toHaveLength(3);
    expect(run(onTime(1, 3), '2025-06-30', small).points).toBe(0);
  });
});

describe('own behaviour drift layer', () => {
  it('scores 0 with no reasons when every EMI is on time', () => {
    expect(run(onTime(1, 6), '2024-07-31')).toEqual({ points: 0, reasons: [] });
  });

  it('counts an EMI late only after the 5-day grace period', () => {
    expect(run([...onTime(1, 5), pay(6, 5)], '2024-07-31').points).toBe(0);
    const late = run([...onTime(1, 5), pay(6, 6)], '2024-07-31');
    expect(late.points).toBe(4);
    expect(codes(late)).toEqual(['late_emi']);
    expect(late.reasons[0]?.facts).toMatchObject({ count: 1, max_days_late: 6 });
  });

  it('counts a payment partial below 90% of the usual EMI', () => {
    expect(run([...onTime(1, 5), pay(6, 0, 90_000)], '2024-07-31').points).toBe(0);
    const partial = run([...onTime(1, 5), pay(6, 0, 89_999)], '2024-07-31');
    expect(codes(partial)).toEqual(['partial_emi']);
    expect(partial.points).toBe(4);
  });

  it('counts an unpaid EMI as missed only once the grace period has passed', () => {
    expect(run(onTime(1, 5), '2024-07-15').points).toBe(0);
    const missed = run(onTime(1, 5), '2024-07-16');
    expect(codes(missed)).toEqual(['missed_emi']);
    expect(missed.points).toBe(4);
    expect(missed.reasons[0]?.evidence_ids).toEqual(['emi:L-1:6']);
  });

  it('scores 8 for two unmet EMIs in a row and 4 for two apart', () => {
    expect(run(onTime(1, 4), '2024-07-31').points).toBe(8);
    expect(run([...onTime(1, 3), pay(4, 9), pay(5), pay(6, 9)], '2024-07-31').points).toBe(4);
    expect(
      run([pay(1), pay(2, 9), pay(3), pay(4), pay(5, 0, 50_000), pay(6)], '2024-07-31').points,
    ).toBe(4);
  });

  it('scores 10 for three or more unmet EMIs', () => {
    const r = run([pay(1, 9), pay(2), pay(3, 9), pay(4), pay(5, 9), pay(6)], '2024-07-31');
    expect(r.points).toBe(10);
  });

  it('scores 10 for a delay that grows over three EMIs, ending past the grace period', () => {
    const growing = run([...onTime(1, 3), pay(4, 3), pay(5, 4), pay(6, 6)], '2024-07-31');
    expect(growing.points).toBe(10);
    expect(growing.reasons.find((r) => r.code === 'growing_delay')?.points).toBe(10);
    expect(run([...onTime(1, 3), pay(4, 3), pay(5, 6), pay(6, 6)], '2024-07-31').points).toBe(8);
    expect(run([...onTime(1, 3), pay(4, 1), pay(5, 2), pay(6, 3)], '2024-07-31').points).toBe(0);
  });

  it('looks back over the last 6 EMIs only', () => {
    expect(run([pay(1, 9), ...onTime(2, 7)], '2024-08-31').points).toBe(0);
    expect(run([pay(1, 9), ...onTime(2, 6)], '2024-07-31').points).toBe(4);
  });

  it('adds 1 for receipts down 25% and 2 for down 50%, within the cap of 10', () => {
    const emis = onTime(1, 11);
    const r = (last: number): BehaviourInput => ({
      loan: LOAN,
      asOf: '2024-12-31',
      transactions: [
        ...emis,
        receipt('old', '2024-08-01', 100_000),
        receipt('new', '2024-12-01', last),
      ],
    });
    expect(receiptsFallPercent(r(76_000))).toBe(24);
    expect(behaviourLayer(r(76_000), S).points).toBe(0);
    expect(behaviourLayer(r(75_000), S).points).toBe(1);
    expect(behaviourLayer(r(51_000), S).points).toBe(1);
    expect(behaviourLayer(r(50_000), S).points).toBe(2);
    expect(codes(behaviourLayer(r(50_000), S))).toEqual(['receipts_fall']);
    const capped = {
      ...r(10_000),
      transactions: [
        ...onTime(1, 8),
        receipt('old', '2024-08-01', 100_000),
        receipt('new', '2024-12-01', 10_000),
      ],
    };
    expect(behaviourLayer(capped, S).points).toBe(10);
  });

  it('does not compare receipts in the first 180 days', () => {
    const t = [receipt('old', '2024-03-01', 100_000), receipt('new', '2024-06-01', 10_000)];
    expect(receiptsFallPercent({ loan: LOAN, asOf: '2024-07-07', transactions: t })).toBeNull();
    expect(receiptsFallPercent({ loan: LOAN, asOf: '2024-07-08', transactions: t })).toBe(90);
  });
});
