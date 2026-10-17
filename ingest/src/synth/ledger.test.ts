import type { SynthTransaction } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  LedgerBuilder,
  LedgerError,
  checkLedger,
  compareTxn,
  synthTxn,
  type TxnFields,
} from './ledger.js';

const f = (id: string, from: string, to: string, amountMinor: number, at: string): TxnFields => ({
  id,
  loanId: 'L1',
  at,
  fromId: from,
  toId: to,
  amountMinor,
  type: 'neft',
});
const opening = new Map([['A', 1_000]]);

describe('synthTxn', () => {
  it('marks the row synthetic, sets the source and derives the reference', () => {
    const t = synthTxn(f('T1', 'A', 'X', 5, '2024-01-01T00:00:00.000Z'));
    expect(t).toMatchObject({ synthetic: true, source: 'import', reference: 'SYNTH-REF-T1' });
  });

  it('refuses amounts that are not positive safe integers and instants that are not UTC', () => {
    for (const amount of [0, -5, 1.5, Number.NaN])
      expect(() => synthTxn(f('T1', 'A', 'X', amount, '2024-01-01T00:00:00.000Z'))).toThrow();
    expect(() => synthTxn(f('T1', 'A', 'X', 5, '2024-01-01'))).toThrow();
  });
});

describe('checkLedger', () => {
  it('accepts a spend down to exactly zero', () => {
    expect(
      checkLedger(opening, [synthTxn(f('T1', 'A', 'X', 1_000, '2024-01-01T00:00:00.000Z'))]),
    ).toEqual([]);
  });

  it('flags the transaction that takes a tracked account below zero, but not an external account', () => {
    const txns = [synthTxn(f('T1', 'A', 'X', 1_001, '2024-01-01T00:00:00.000Z'))];
    const v = checkLedger(opening, txns);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'negative_balance', accountId: 'A', txnId: 'T1' });
    expect(checkLedger(new Map(), txns)).toEqual([]);
  });

  it('replays in time order, not in the order the rows were given', () => {
    const credit = synthTxn(f('T2', 'X', 'A', 500, '2024-01-01T00:00:00.000Z'));
    const spend = synthTxn(f('T1', 'A', 'Y', 1_400, '2024-01-02T00:00:00.000Z'));
    expect(checkLedger(opening, [spend, credit])).toEqual([]);
    const early = synthTxn(f('T3', 'A', 'Y', 1_400, '2023-12-31T00:00:00.000Z'));
    expect(checkLedger(opening, [credit, early])).toHaveLength(1);
  });

  it('allows an overdraft only for accounts that are named', () => {
    const txns = [synthTxn(f('T1', 'A', 'X', 2_000, '2024-01-01T00:00:00.000Z'))];
    expect(checkLedger(opening, txns, new Set(['A']))).toEqual([]);
  });

  it('flags a repeated id', () => {
    const t = synthTxn(f('T1', 'X', 'Y', 1, '2024-01-01T00:00:00.000Z'));
    expect(checkLedger(new Map(), [t, t]).map((v) => v.kind)).toEqual(['duplicate_id']);
  });

  it('does not change its inputs', () => {
    const txns = [
      synthTxn(f('T2', 'A', 'X', 1, '2024-01-02T00:00:00.000Z')),
      synthTxn(f('T1', 'A', 'X', 1, '2024-01-01T00:00:00.000Z')),
    ];
    const snapshot = JSON.stringify(txns);
    checkLedger(opening, txns);
    expect(JSON.stringify(txns)).toBe(snapshot);
  });
});

describe('LedgerBuilder', () => {
  it('returns transactions sorted by time then id and reports balances', () => {
    const b = new LedgerBuilder(opening);
    b.add(f('T3', 'A', 'X', 100, '2024-01-03T00:00:00.000Z'));
    b.add(f('T1', 'Y', 'A', 50, '2024-01-01T00:00:00.000Z'));
    b.add(f('T2', 'A', 'X', 100, '2024-01-01T00:00:00.000Z'));
    expect(b.build().map((t) => t.id)).toEqual(['T1', 'T2', 'T3']);
    expect(b.balance('A')).toBe(850);
  });

  it('throws a LedgerError that says what is wrong', () => {
    const b = new LedgerBuilder(opening);
    b.add(f('T1', 'A', 'X', 5_000, '2024-01-01T00:00:00.000Z'));
    expect(() => b.build()).toThrow(LedgerError);
    expect(() => b.build()).toThrow(/A would be -4000 after T1/);
    expect(() => b.balance('Z')).toThrow(RangeError);
  });

  it('orders ties by id with a plain string comparison', () => {
    const t = (id: string): SynthTransaction =>
      synthTxn(f(id, 'X', 'Y', 1, '2024-01-01T00:00:00.000Z'));
    expect(compareTxn(t('T10'), t('T2'))).toBeLessThan(0);
    expect(compareTxn(t('T2'), t('T2'))).toBe(0);
  });
});
