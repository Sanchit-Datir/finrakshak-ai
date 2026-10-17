import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../demo/seed.js';
import type { TransactionType } from '../domain/schemas.js';
import { loanOutflows, runMonitoring } from './monitoring.js';
import { BIG_LOAN, DAY, HOUR, loan, party, singleLoan, txn, world } from './monitoring-world.js';

/**
 * Characterisation tests: each threshold is checked on both sides of its edge, with one transfer
 * placed at an exact offset from disbursement. All parties are fictional.
 */

const cfg = defaultSettings().monitoring;
const rules = (db: Parameters<typeof runMonitoring>[0]): string[] =>
  runMonitoring(db)
    .map((a) => a.ruleId)
    .sort();

describe('loanOutflows window', () => {
  const l = loan('L1', 'B', BIG_LOAN, 30);
  const out = (
    id: string,
    offset: number,
    type: TransactionType = 'neft',
    from = 'B-acc',
  ): ReturnType<typeof txn> => txn(id, from, 'C-acc', 1_000, offset, type);

  it('includes disbursement time and the last monitoring day, excludes just outside both ends', () => {
    const txns = [
      out('before', -1),
      out('start', 0),
      out('end', 30 * DAY),
      out('after', 30 * DAY + 1),
    ];
    expect(loanOutflows(l, txns).map((t) => t.id)).toEqual(['start', 'end']);
  });

  it('ignores repayments and transfers from other accounts, and returns time order', () => {
    const txns = [
      out('late', 2 * DAY),
      out('repay', DAY, 'repayment'),
      out('other', DAY, 'neft', 'C-acc'),
      out('early', DAY),
    ];
    expect(loanOutflows(l, txns).map((t) => t.id)).toEqual(['early', 'late']);
  });
});

describe('rapid_onward (72 hours, 70% by default)', () => {
  const LOAN = 10_000_000;
  const run = (amount: number, offset: number, type: TransactionType = 'neft'): string[] =>
    rules(singleLoan([txn('T1', 'B-acc', 'C-acc', amount, offset, type)], { amountMinor: LOAN }));

  it('fires at exactly 70% and exactly 72 hours', () => {
    expect(run(7_000_000, 72 * HOUR)).toEqual(['rapid_onward']);
  });
  it('does not fire one minor unit below 70%', () => {
    expect(run(6_999_999, 0)).toEqual([]);
  });
  it('does not fire when the transfer is one millisecond after the 72-hour window', () => {
    expect(run(7_000_000, 72 * HOUR + 1)).toEqual([]);
  });
  it('does not count repayments or transfers before disbursement', () => {
    expect(run(7_000_000, 0, 'repayment')).toEqual([]);
    expect(run(7_000_000, -1)).toEqual([]);
  });
  it('adds several transfers inside the window and reports all of them', () => {
    const db = singleLoan(
      [
        txn('T1', 'B-acc', 'C-acc', 4_000_000, HOUR),
        txn('T2', 'B-acc', 'X-acc', 3_000_000, 2 * HOUR),
      ],
      { amountMinor: LOAN },
    );
    const [alert] = runMonitoring(db);
    expect(alert?.ruleId).toBe('rapid_onward');
    expect(alert?.transactionIds).toEqual(['T1', 'T2']);
    expect(alert?.totalMinor).toBe(7_000_000);
  });
  it('treats a zero-amount loan as no alert and does not divide by zero', () => {
    expect(rules(singleLoan([txn('T1', 'B-acc', 'C-acc', 1, 0)], { amountMinor: 0 }))).toEqual([]);
  });
  it('follows the configured threshold', () => {
    const db = singleLoan([txn('T1', 'B-acc', 'C-acc', 5_000_000, 0)], {
      amountMinor: LOAN,
      monitoring: { rapidOnwardPercent: 50 },
    });
    expect(rules(db)).toEqual(['rapid_onward']);
  });
});

describe('cash_split (3 withdrawals at 90–99% of the reference within 7 days)', () => {
  const REF = cfg.cashReferenceMinor;
  const NEAR = (REF * cfg.cashNearPercent) / 100;
  const cash = (id: string, amount: number, offset: number): ReturnType<typeof txn> =>
    txn(id, 'B-acc', 'C-acc', amount, offset, 'cash_withdrawal');
  const three = (a: number, b: number, c: number, amount = NEAR): string[] =>
    rules(singleLoan([cash('T1', amount, a), cash('T2', amount, b), cash('T3', amount, c)]));

  it('fires for three withdrawals at exactly 90% inside 7 days', () => {
    expect(three(DAY, 2 * DAY, 3 * DAY)).toEqual(['cash_split']);
  });
  it('does not fire one minor unit below 90%', () => {
    expect(three(DAY, 2 * DAY, 3 * DAY, NEAR - 1)).toEqual([]);
  });
  it('does not count a withdrawal equal to the reference (the upper bound is exclusive)', () => {
    expect(three(DAY, 2 * DAY, 3 * DAY, REF)).toEqual([]);
  });
  it('needs three: two are not enough', () => {
    expect(rules(singleLoan([cash('T1', NEAR, DAY), cash('T2', NEAR, 2 * DAY)]))).toEqual([]);
  });
  it('includes a third withdrawal exactly 7 days after the first, not 1 ms later', () => {
    expect(three(DAY, 2 * DAY, 8 * DAY)).toEqual(['cash_split']);
    expect(three(DAY, 2 * DAY, 8 * DAY + 1)).toEqual([]);
  });
  it('ignores transfers that are not cash withdrawals', () => {
    const txns = ['T1', 'T2', 'T3'].map((id, i) =>
      txn(id, 'B-acc', 'C-acc', NEAR, (i + 1) * DAY, 'neft'),
    );
    expect(rules(singleLoan(txns))).toEqual([]);
  });
  it('reports one alert even when more withdrawals qualify', () => {
    const txns = [1, 2, 3, 4].map((d) => cash(`T${d}`, NEAR, d * DAY));
    expect(runMonitoring(singleLoan(txns)).filter((a) => a.ruleId === 'cash_split')).toHaveLength(
      1,
    );
  });
});

describe('repeated_counterparty (2 loans, 60 days, at least ₹1 lakh each)', () => {
  const MIN = cfg.repeatedCounterpartyMinAmountMinor;
  const two = (
    secondAmount: number,
    secondOffset: number,
    type: TransactionType = 'neft',
  ): ReturnType<typeof runMonitoring> =>
    runMonitoring(
      world({
        entities: ['B1', 'B2', 'C'].flatMap((id) =>
          party(id, id === 'C' ? 'counterparty' : 'company'),
        ),
        loans: [loan('L1', 'B1', BIG_LOAN), loan('L2', 'B2', BIG_LOAN)],
        transactions: [
          txn('T1', 'B1-acc', 'C-acc', MIN, DAY, 'neft', 'L1'),
          txn('T2', 'B2-acc', 'C-acc', secondAmount, secondOffset, type, 'L2'),
        ],
      }),
    );

  it('raises one alert per loan when two loans pay the same counterparty', () => {
    const alerts = two(MIN, 2 * DAY);
    expect(alerts.map((a) => [a.ruleId, a.loanId])).toEqual([
      ['repeated_counterparty', 'L1'],
      ['repeated_counterparty', 'L2'],
    ]);
    expect(alerts[0]?.totalMinor).toBe(2 * MIN);
  });
  it('fires with the two payments exactly 60 days apart, not 1 ms more', () => {
    expect(two(MIN, DAY + 60 * DAY)).toHaveLength(2);
    expect(two(MIN, DAY + 60 * DAY + 1)).toHaveLength(0);
  });
  it('ignores a payment one minor unit below the minimum and cash withdrawals', () => {
    expect(two(MIN - 1, 2 * DAY)).toHaveLength(0);
    expect(two(MIN, 2 * DAY, 'cash_withdrawal')).toHaveLength(0);
  });
  it('needs two different loans: one loan paying twice is not enough', () => {
    const db = singleLoan([
      txn('T1', 'B-acc', 'C-acc', MIN, DAY),
      txn('T2', 'B-acc', 'C-acc', MIN, 2 * DAY),
    ]);
    expect(rules(db)).toEqual([]);
  });
});
