import type { SynthTransaction } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { HOUR, addDays, addMonths, istDayOf, istMonthOf } from '../calendar.js';
import { makeHorizon } from '../base.js';
import { LedgerBuilder } from '../ledger.js';
import { NameBook } from '../names.js';
import { createRng } from '../rng.js';
import { bigPrepayment } from './bigPrepayment.js';
import { CASH_REFERENCE, cashSplit } from './cashSplit.js';
import { contagion } from './contagion.js';
import { dormantBurst } from './dormantBurst.js';
import { nearThreshold } from './nearThreshold.js';
import { roundTrip } from './roundTrip.js';
import { seasonal } from './seasonal.js';
import { sharedAddress } from './sharedAddress.js';
import type { Archetype, BuiltLoan, LoanContext } from './types.js';

const horizon = makeHorizon('2024-01', 24);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const DAY = 24 * HOUR;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

function build(a: Archetype, seed: number): { built: BuiltLoan; txns: SynthTransaction[] } {
  const root = createRng(seed);
  const built = a.build({
    n: 1,
    rng: root.fork(`${a.id}/1`),
    names: new NameBook(root.fork('names')),
    horizon,
  });
  const ledger = new LedgerBuilder(new Map([[built.loan.accountEntityId, 0]]));
  for (const t of built.transactions) ledger.add(t);
  return { built, txns: ledger.build() };
}

const outOf = (built: BuiltLoan, txns: SynthTransaction[]): SynthTransaction[] =>
  txns.filter((t) => t.fromId === built.loan.accountEntityId && t.type !== 'repayment');
const sinceDisbursal = (built: BuiltLoan, t: SynthTransaction): number =>
  Date.parse(t.at) - Date.parse(built.loan.disbursedAt);

describe('round_trip', () => {
  it('sends money to an unlinked intermediary and gets 60–95% back inside 30 days', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(roundTrip, seed);
      const legs = txns.filter((t) => t.id.includes('-X'));
      expect(legs.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(legs.length).toBeLessThanOrEqual(3);
      const [first, last] = [legs[0], legs.at(-1)];
      expect(first?.fromId).toBe(built.loan.accountEntityId);
      expect(last?.toId).toBe(built.loan.accountEntityId);
      const ratio = (last?.amountMinor ?? 0) / (first?.amountMinor ?? 1);
      expect(ratio, `seed ${seed}`).toBeGreaterThanOrEqual(0.55);
      expect(ratio).toBeLessThanOrEqual(0.96);
      expect(sinceDisbursal(built, must(last))).toBeLessThanOrEqual(30 * DAY);
      expect(sinceDisbursal(built, must(first))).toBeGreaterThan(72 * HOUR);
      expect(built.relationships).toEqual([]);
      expect(built.truth.expected_rules).toEqual(['circular']);
    }
  });
});

describe('cash_split', () => {
  it('makes 3–5 cash withdrawals of 92–98% of ₹1 lakh within 6 days', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(cashSplit, seed);
      const cash = txns.filter((t) => t.type === 'cash_withdrawal');
      expect(cash.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(cash.length).toBeLessThanOrEqual(5);
      for (const t of cash) {
        expect(t.amountMinor).toBeGreaterThanOrEqual(CASH_REFERENCE * 0.9);
        expect(t.amountMinor).toBeLessThan(CASH_REFERENCE);
      }
      const span = Date.parse(cash.at(-1)?.at ?? '') - Date.parse(cash[0]?.at ?? '');
      expect(span, `seed ${seed}`).toBeLessThanOrEqual(6 * DAY);
      expect(built.truth.expected_rules).toEqual(['cash_split']);
    }
  });
});

describe('near_threshold', () => {
  it('stays just under all three rules: under 70% in 72 hours, under 50% back, only two cash withdrawals', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(nearThreshold, seed);
      const early = outOf(built, txns).filter((t) => sinceDisbursal(built, t) <= 72 * HOUR);
      const share = early.reduce((s, t) => s + t.amountMinor, 0) / built.loan.amountMinor;
      expect(share, `seed ${seed}`).toBeGreaterThanOrEqual(0.66);
      expect(share).toBeLessThan(0.7);
      const out = txns.find((t) => t.id.endsWith('-N2'));
      const back = txns.find((t) => t.id.endsWith('-N3'));
      expect((back?.amountMinor ?? 1) / (out?.amountMinor ?? 1), `seed ${seed}`).toBeLessThan(0.5);
      expect((back?.amountMinor ?? 0) / (out?.amountMinor ?? 1)).toBeGreaterThanOrEqual(0.4);
      const cash = txns.filter((t) => t.type === 'cash_withdrawal');
      expect(cash).toHaveLength(2);
      expect(
        cash.every((t) => t.amountMinor >= CASH_REFERENCE * 0.9 && t.amountMinor < CASH_REFERENCE),
      ).toBe(true);
      expect(built.truth.expected_rules).toEqual([]);
      expect(built.truth.class).toBe('lookalike');
    }
  });
});

describe('contagion', () => {
  it('stops the top customer’s payments at the flag month and flags that same customer', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(contagion, seed);
      const [flag] = built.flags;
      const top = built.entities.find((e) => e.id === `B-0001-C1`);
      expect(flag?.entity.canonical_name, `seed ${seed}`).toBe(top?.name);
      expect(flag?.event.case_type).toBe('ibbi_cirp');
      expect(flag?.evidence_status).toBe('fact');
      const flagMonth = flag?.event_date.slice(0, 7) ?? '';
      expect(flagMonth).toBe(built.truth.onset_month);
      const fromTop = txns.filter((t) => t.fromId === 'B-0001-C1-acc');
      expect(fromTop.length).toBeGreaterThan(0);
      expect(fromTop.every((t) => istDayOf(t.at) < addMonths(`${flagMonth}-01`, 0))).toBe(true);
    }
  });

  it('turns Needs attention only from the third month of late EMIs, and never Urgent', () => {
    for (const seed of SEEDS) {
      const { built } = build(contagion, seed);
      const bands = built.truth.months.map((m) => m.expected_band);
      expect(bands.includes('urgent')).toBe(false);
      const firstAttention = built.truth.months.findIndex(
        (m) => m.expected_band === 'needs_attention',
      );
      const onset = built.truth.months.findIndex((m) => m.month === built.truth.onset_month);
      if (firstAttention >= 0) expect(firstAttention - onset, `seed ${seed}`).toBe(2);
      expect(built.truth.expected_rules).toEqual([]);
    }
  });
});

describe('seasonal', () => {
  it('at least doubles its receipts from the thinnest to the busiest month while paying every EMI', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(seasonal, seed);
      const receipts = txns.filter(
        (t) => t.toId === built.loan.accountEntityId && t.type !== 'disbursement',
      );
      const byMonth = new Map<string, number>();
      for (const t of receipts)
        byMonth.set(istMonthOf(t.at), (byMonth.get(istMonthOf(t.at)) ?? 0) + t.amountMinor);
      const totals = [...byMonth.values()].slice(1, -1);
      expect(Math.max(...totals) / Math.min(...totals), `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(txns.filter((t) => t.type === 'repayment').length).toBeGreaterThanOrEqual(6);
      expect(built.truth.months.every((m) => m.expected_band === 'routine')).toBe(true);
    }
  });
});

describe('big_prepayment', () => {
  it('makes one early repayment far larger than an EMI, funded by a customer, and then pays smaller EMIs', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(bigPrepayment, seed);
      const repayments = txns.filter((t) => t.type === 'repayment');
      const prepay = repayments.find((t) => t.id.endsWith('-P2'));
      const regular = repayments.filter((t) => t !== prepay);
      expect(prepay?.amountMinor, `seed ${seed}`).toBeGreaterThan(
        3 * (regular[0]?.amountMinor ?? 1),
      );
      const funding = txns.find((t) => t.id.endsWith('-P1'));
      expect(funding?.toId).toBe(built.loan.accountEntityId);
      expect((funding?.amountMinor ?? 0) >= (prepay?.amountMinor ?? 1)).toBe(true);
      expect(regular.at(-1)?.amountMinor ?? 0).toBeLessThan(regular[0]?.amountMinor ?? 0);
      expect(built.truth.months.every((m) => m.expected_band === 'routine')).toBe(true);
    }
  });
});

describe('dormant_burst (held out)', () => {
  it('has no customer receipts for months, then a burst, and is expected to go unnoticed', () => {
    for (const seed of SEEDS) {
      const { built, txns } = build(dormantBurst, seed);
      const receipts = txns.filter(
        (t) => /^B-0001-C\d-acc$/.test(t.fromId) && t.toId === built.loan.accountEntityId,
      );
      const disbursedOn = istDayOf(built.loan.disbursedAt);
      expect(istDayOf(receipts[0]?.at ?? '') >= addMonths(disbursedOn, 3), `seed ${seed}`).toBe(
        true,
      );
      const times = receipts.map((t) => Date.parse(t.at));
      const busiest = Math.max(
        ...times.map((from) => times.filter((x) => x >= from && x < from + 31 * DAY).length),
      );
      expect(busiest, `seed ${seed}`).toBeGreaterThanOrEqual(8);
      expect(built.truth.class).toBe('held_out');
      expect(built.truth.expected_rules).toEqual([]);
      expect(
        built.truth.months.every(
          (m) => m.expected_band === 'routine' && m.expected_patterns.length === 0,
        ),
      ).toBe(true);
    }
  });
});

describe('shared_address (a cluster)', () => {
  function cluster(seed: number, size: number): BuiltLoan[] {
    const root = createRng(seed);
    const names = new NameBook(root.fork('names'));
    const contexts: LoanContext[] = Array.from({ length: size }, (_, i) => ({
      n: i + 1,
      rng: root.fork(`shared_address/${i + 1}`),
      names,
      horizon,
    }));
    return sharedAddress.buildGroup(contexts, root.fork('shared_address/group'));
  }

  it('links four borrowers to the hub, has all five pay one payee within 60 days, and flags only the hub', () => {
    for (const seed of SEEDS) {
      const loans = cluster(seed, 5);
      expect(loans).toHaveLength(5);
      const relationships = loans.flatMap((l) => l.relationships);
      expect(relationships).toHaveLength(4);
      expect(relationships.every((r) => r.type === 'shares_address' && r.to === 'B-0001')).toBe(
        true,
      );
      const payments = loans.flatMap((l) =>
        l.transactions.filter((t) => t.toId === 'G-0001-Z-acc'),
      );
      expect(payments, `seed ${seed}`).toHaveLength(5);
      expect(payments.every((t) => t.amountMinor >= 10_000_000)).toBe(true);
      const times = payments.map((t) => Date.parse(t.at));
      expect(Math.max(...times) - Math.min(...times), `seed ${seed}`).toBeLessThanOrEqual(60 * DAY);
      expect(loans.flatMap((l) => l.flags)).toHaveLength(1);
      expect(loans[0]?.flags[0]?.evidence_status).toBe('allegation');
      expect(loans.every((l) => l.truth.expected_rules.join() === 'repeated_counterparty')).toBe(
        true,
      );
    }
  });

  it('marks the others as linked to the flagged hub from the flag month on', () => {
    const loans = cluster(3, 5);
    const flagMonth = loans[0]?.flags[0]?.event_date.slice(0, 7) ?? '';
    const spoke = loans[1];
    const before = spoke?.truth.months.find((m) => m.month < flagMonth);
    const after = spoke?.truth.months.find((m) => m.month === flagMonth);
    expect(before?.expected_reasons).toEqual(['repeated_counterparty']);
    expect(after?.expected_reasons).toContain('shared_address_with_flagged');
    expect(after?.expected_band).toBe('needs_attention');
    expect(loans[0]?.truth.months.find((m) => m.month === flagMonth)?.expected_band).toBe('urgent');
  });

  it('gives a cluster of one loan no common payee and no rules', () => {
    const [only, ...rest] = cluster(5, 1);
    expect(rest).toEqual([]);
    expect(only?.truth.expected_rules).toEqual([]);
    expect(only?.transactions.some((t) => t.toId.startsWith('G-'))).toBe(false);
  });

  it('handles a cluster of two', () => {
    const loans = cluster(5, 2);
    expect(loans.flatMap((l) => l.relationships)).toHaveLength(1);
    expect(loans.every((l) => l.truth.expected_rules.length === 1)).toBe(true);
  });

  it('keeps the first payment of every loan within 90 days of its own disbursement', () => {
    for (const l of cluster(9, 5)) {
      const pay = l.transactions.find((t) => t.toId === 'G-0001-Z-acc');
      expect(Date.parse(pay?.at ?? '') - Date.parse(l.loan.disbursedAt)).toBeLessThanOrEqual(
        90 * DAY,
      );
    }
    expect(addDays('2024-01-01', 0)).toBe('2024-01-01');
  });
});
