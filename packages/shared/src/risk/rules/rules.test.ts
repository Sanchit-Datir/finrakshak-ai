import { describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  detectCashSplit,
  detectCircular,
  detectLinkedCounterparty,
  detectMonitoring,
  detectRapidOnward,
  detectRepeatedCounterparty,
  linkedEntities,
  loanOutflows,
  type RuleConfig,
  type RuleEntity,
  type RuleLoan,
  type RuleRelationship,
  type RuleTransaction,
} from './index.js';

// The default thresholds the app ships with (web/src/demo/seed.ts). Money is paise: ₹1 lakh = 10_000_000.
const CFG: RuleConfig = {
  rapidOnwardHours: 72,
  rapidOnwardPercent: 70,
  repeatedCounterpartyMinLoans: 2,
  repeatedCounterpartyWindowDays: 60,
  repeatedCounterpartyMinAmountMinor: 10_000_000,
  circularWindowDays: 30,
  circularMinReturnPercent: 50,
  cashReferenceMinor: 10_000_000,
  cashNearPercent: 90,
  cashMinCount: 3,
  cashWindowDays: 7,
};
const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

const loan = (id: string, amountMinor: number, owner = 'B'): RuleLoan => ({
  id,
  amountMinor,
  disbursedAt: at(0),
  monitoringDays: 90,
  accountEntityId: `${owner}-acc`,
});
const txn = (
  id: string,
  fromId: string,
  toId: string,
  amountMinor: number,
  offsetMs: number,
  type = 'neft',
): RuleTransaction => ({ id, at: at(offsetMs), fromId, toId, amountMinor, type });
const party = (id: string): RuleEntity[] => [
  { id, ownerId: null },
  { id: `${id}-acc`, ownerId: id },
];
const ENTITIES = new Map(['B', 'B2', 'C', 'X', 'Y', 'P'].flatMap(party).map((e) => [e.id, e]));
const BIG = 1_000_000_000_000;
const rel = (from: string, to: string, type: string, status = 'verified'): RuleRelationship => ({
  from,
  to,
  type,
  status,
});

describe('loanOutflows', () => {
  it('keeps the window ends, drops repayments and other accounts, and sorts by time', () => {
    const l = { ...loan('L1', BIG), monitoringDays: 30 };
    const txns = [
      txn('end', 'B-acc', 'C-acc', 1, 30 * DAY),
      txn('after', 'B-acc', 'C-acc', 1, 30 * DAY + 1),
      txn('repay', 'B-acc', 'C-acc', 1, DAY, 'repayment'),
      txn('other', 'C-acc', 'B-acc', 1, DAY),
      txn('start', 'B-acc', 'C-acc', 1, 0),
      txn('before', 'B-acc', 'C-acc', 1, -1),
    ];
    expect(loanOutflows(l, txns).map((t) => t.id)).toEqual(['start', 'end']);
  });
});

describe('detectRapidOnward', () => {
  const run = (amount: number, offset: number): number =>
    detectRapidOnward(loan('L1', 10_000_000), [txn('T1', 'B-acc', 'C-acc', amount, offset)], CFG)
      .length;

  it('fires at exactly 70% and 72 hours, and not at 69.99999% or 1 ms late', () => {
    expect(run(7_000_000, 72 * HOUR)).toBe(1);
    expect(run(6_999_999, 0)).toBe(0);
    expect(run(7_000_000, 72 * HOUR + 1)).toBe(0);
  });

  it('reports the share, total, transfers and the time of the last one', () => {
    const [d] = detectRapidOnward(
      loan('L1', 10_000_000),
      [
        txn('T1', 'B-acc', 'C-acc', 4_000_000, HOUR),
        txn('T2', 'B-acc', 'X-acc', 4_000_000, 2 * HOUR),
      ],
      CFG,
    );
    expect(d?.percent).toBe(80);
    expect(d?.totalMinor).toBe(8_000_000);
    expect(d?.transactions.map((t) => t.id)).toEqual(['T1', 'T2']);
    expect(d?.detectedAt).toBe(at(2 * HOUR));
  });

  it('never divides by zero for a loan of zero', () => {
    expect(detectRapidOnward(loan('L1', 0), [txn('T1', 'B-acc', 'C-acc', 1, 0)], CFG)).toEqual([]);
  });
});

describe('detectCashSplit', () => {
  const near = (CFG.cashReferenceMinor * CFG.cashNearPercent) / 100;
  const cash = (n: number, amount: number, offset: number): RuleTransaction =>
    txn(`T${n}`, 'B-acc', 'C-acc', amount, offset, 'cash_withdrawal');
  const count = (amount: number, third: number): number =>
    detectCashSplit(
      loan('L1', BIG),
      [cash(1, amount, DAY), cash(2, amount, 2 * DAY), cash(3, amount, third)],
      CFG,
    ).length;

  it('needs withdrawals from 90% (inclusive) up to the reference (exclusive)', () => {
    expect(count(near, 3 * DAY)).toBe(1);
    expect(count(near - 1, 3 * DAY)).toBe(0);
    expect(count(CFG.cashReferenceMinor, 3 * DAY)).toBe(0);
  });

  it('allows the third withdrawal exactly 7 days after the first, not 1 ms later', () => {
    expect(count(near, 8 * DAY)).toBe(1);
    expect(count(near, 8 * DAY + 1)).toBe(0);
  });

  it('reports the band bottom and the total', () => {
    const [d] = detectCashSplit(
      loan('L1', BIG),
      [cash(1, near, DAY), cash(2, near, 2 * DAY), cash(3, near, 3 * DAY)],
      CFG,
    );
    expect(d?.lowerMinor).toBe(near);
    expect(d?.totalMinor).toBe(3 * near);
  });
});

describe('detectCircular', () => {
  const OUT = 40_000_000;
  const loop = (back: number, offset: number): number =>
    detectCircular(
      loan('L1', BIG),
      [txn('T1', 'B-acc', 'X-acc', OUT, DAY), txn('T2', 'X-acc', 'B-acc', back, offset)],
      CFG,
    ).length;

  it('fires at exactly 50% back and at day 30, not below or later', () => {
    expect(loop(OUT / 2, 2 * DAY)).toBe(1);
    expect(loop(OUT / 2 - 1, 2 * DAY)).toBe(0);
    expect(loop(OUT, 30 * DAY)).toBe(1);
    expect(loop(OUT, 30 * DAY + 1)).toBe(0);
  });

  it('follows a loop of four transfers but not five', () => {
    const four = ['B', 'X', 'Y', 'P', 'B'].map((id) => `${id}-acc`);
    const legs = (nodes: string[]): RuleTransaction[] =>
      nodes
        .slice(0, -1)
        .map((from, i) => txn(`T${i + 1}`, from, nodes[i + 1] ?? '', OUT, (i + 1) * DAY));
    expect(detectCircular(loan('L1', BIG), legs(four), CFG)).toHaveLength(1);
    const five = ['B', 'X', 'Y', 'P', 'C', 'B'].map((id) => `${id}-acc`);
    expect(detectCircular(loan('L1', BIG), legs(five), CFG)).toEqual([]);
  });

  it('reports the share, the days and the transfers in order', () => {
    const [d] = detectCircular(
      loan('L1', BIG),
      [txn('T1', 'B-acc', 'X-acc', OUT, DAY), txn('T2', 'X-acc', 'B-acc', OUT / 2, 3 * DAY)],
      CFG,
    );
    expect([d?.percent, d?.days, d?.firstMinor, d?.returnedMinor]).toEqual([50, 2, OUT, OUT / 2]);
    expect(d?.transactions.map((t) => t.id)).toEqual(['T1', 'T2']);
  });
});

describe('detectLinkedCounterparty and linkedEntities', () => {
  const pay = [txn('T1', 'B-acc', 'C-acc', 2_000_000, DAY)];
  const run = (rels: RuleRelationship[]): number =>
    detectLinkedCounterparty(loan('L1', BIG), pay, ENTITIES, rels).length;

  it('follows one or two hops in either direction, not three', () => {
    expect(run([rel('B', 'C', 'shares_address')])).toBe(1);
    expect(run([rel('C', 'B', 'shares_address')])).toBe(1);
    expect(run([rel('B', 'P', 'director_of'), rel('P', 'C', 'owner_of')])).toBe(1);
    expect(
      run([rel('B', 'P', 'director_of'), rel('P', 'X', 'owner_of'), rel('X', 'C', 'owner_of')]),
    ).toBe(0);
  });

  it('follows only the four ownership and address link types', () => {
    for (const type of ['director_of', 'owner_of', 'guarantor_for', 'shares_address'])
      expect(run([rel('B', 'C', type)]), type).toBe(1);
    for (const type of ['account_of', 'same_proceeding', 'borrower_for'])
      expect(run([rel('B', 'C', type)]), type).toBe(0);
  });

  it('returns the path so the caller can say a link was inferred', () => {
    const [d] = detectLinkedCounterparty(loan('L1', BIG), pay, ENTITIES, [
      rel('B', 'C', 'shares_address', 'inferred'),
    ]);
    expect(d?.path.map((r) => r.status)).toEqual(['inferred']);
    expect(d?.ownerId).toBe('C');
  });

  it('lists neighbours across link types in both directions', () => {
    const rels = [
      rel('B', 'P', 'director_of'),
      rel('X', 'B', 'guarantor_for'),
      rel('B', 'C', 'account_of'),
    ];
    expect(linkedEntities('B', rels).map((l) => l.entityId)).toEqual(['P', 'X']);
  });
});

describe('detectRepeatedCounterparty', () => {
  const MIN = CFG.repeatedCounterpartyMinAmountMinor;
  const two = (
    amount: number,
    offset: number,
    type = 'neft',
  ): ReturnType<typeof detectRepeatedCounterparty> =>
    detectRepeatedCounterparty(
      [loan('L1', BIG), loan('L2', BIG, 'B2')],
      [
        txn('T1', 'B-acc', 'C-acc', MIN, DAY, type),
        txn('T2', 'B2-acc', 'C-acc', amount, offset, type),
      ],
      ENTITIES,
      CFG,
    );

  it('gives one detection per counterparty, listing both loans', () => {
    const [d, ...rest] = two(MIN, 2 * DAY);
    expect(rest).toEqual([]);
    expect(d?.loanIds).toEqual(['L1', 'L2']);
    expect(d?.counterpartyId).toBe('C');
    expect(d?.totalMinor).toBe(2 * MIN);
  });

  it('fires 60 days apart and not 1 ms more, below the minimum or for cash', () => {
    expect(two(MIN, DAY + 60 * DAY)).toHaveLength(1);
    expect(two(MIN, DAY + 60 * DAY + 1)).toHaveLength(0);
    expect(two(MIN - 1, 2 * DAY)).toHaveLength(0);
    expect(two(MIN, 2 * DAY, 'cash_withdrawal')).toHaveLength(0);
  });
});

describe('detectMonitoring', () => {
  it('runs per loan rapid, linked, circular, cash, then the repeated rule last', () => {
    const detections = detectMonitoring({
      loans: [loan('L1', 10_000_000), loan('L2', BIG, 'B2')],
      entities: [...ENTITIES.values()],
      relationships: [rel('B', 'C', 'shares_address')],
      transactions: [
        txn('T1', 'B-acc', 'C-acc', 10_000_000, HOUR),
        txn('T2', 'B2-acc', 'C-acc', 10_000_000, 2 * DAY),
      ],
      config: CFG,
    });
    expect(detections.map((d) => d.rule)).toEqual([
      'rapid_onward',
      'linked_counterparty',
      'repeated_counterparty',
    ]);
  });
});

describe('detectMonitoring with every rule firing', () => {
  it('keeps the order rapid, linked, circular, cash for a loan and the repeated rule after all loans', () => {
    const cash = (n: number, offset: number): RuleTransaction =>
      txn(`C${n}`, 'B-acc', 'P-acc', 9_000_000, offset, 'cash_withdrawal');
    const detections = detectMonitoring({
      loans: [loan('L1', 10_000_000), loan('L2', BIG, 'B2')],
      entities: [...ENTITIES.values()],
      relationships: [rel('B', 'C', 'shares_address')],
      transactions: [
        txn('T1', 'B-acc', 'C-acc', 10_000_000, HOUR),
        txn('T2', 'B-acc', 'X-acc', 4_000_000, 2 * HOUR),
        txn('T3', 'X-acc', 'B-acc', 4_000_000, 3 * HOUR),
        cash(1, 4 * DAY),
        cash(2, 5 * DAY),
        cash(3, 6 * DAY),
        txn('T9', 'B2-acc', 'C-acc', 10_000_000, 2 * DAY),
      ],
      config: CFG,
    });
    expect(detections.map((d) => `${d.rule}:${'loanId' in d ? d.loanId : '-'}`)).toEqual([
      'rapid_onward:L1',
      'linked_counterparty:L1',
      'circular:L1',
      'cash_split:L1',
      'repeated_counterparty:-',
    ]);
  });
});
