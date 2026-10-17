import type { SynthTransaction } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  HOUR,
  addDays,
  addMonths,
  addMonthsToMonth,
  istDayOf,
  monthsBetween,
} from '../calendar.js';
import { emiCount, makeHorizon } from '../base.js';
import { LedgerBuilder } from '../ledger.js';
import { NameBook } from '../names.js';
import { createRng } from '../rng.js';
import { control } from './control.js';
import { fundDiversion } from './fundDiversion.js';
import { slowBurn } from './slowBurn.js';
import { suddenEnforcement } from './suddenEnforcement.js';
import type { Archetype, BuiltLoan } from './types.js';

const horizon = makeHorizon('2024-01', 24);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function buildWith(
  a: Archetype,
  seed: number,
  h = horizon,
): { built: BuiltLoan; txns: SynthTransaction[] } {
  const root = createRng(seed);
  const built = a.build({
    n: 1,
    rng: root.fork(`${a.id}/1`),
    names: new NameBook(root.fork('names')),
    horizon: h,
  });
  const ledger = new LedgerBuilder(new Map([[built.loan.accountEntityId, 0]]));
  for (const t of built.transactions) ledger.add(t);
  return { built, txns: ledger.build() };
}

/** The days between each EMI's due date and its payment, by EMI number; null = not paid. */
function emiDelays(built: BuiltLoan, txns: SynthTransaction[]): (number | null)[] {
  const disbursedOn = istDayOf(built.loan.disbursedAt);
  const paid = txns.filter((t) => t.type === 'repayment');
  const total = emiCount({ disbursedOn, tenor: built.tenor }, horizon);
  return Array.from({ length: total }, (_, i) => {
    const due = addMonths(disbursedOn, i + 1);
    const hit = paid.find(
      (t) =>
        istDayOf(t.at) >= due &&
        istDayOf(t.at) <= addDays(due, 40) &&
        !paid.some((o) => o !== t && istDayOf(o.at) >= due && istDayOf(o.at) < istDayOf(t.at)),
    );
    return hit === undefined ? null : (Date.parse(istDayOf(hit.at)) - Date.parse(due)) / 86_400_000;
  });
}

const bandRank = { routine: 0, needs_attention: 1, urgent: 2 } as const;

describe('control', () => {
  it('pays every EMI within two days of the due date, in full, with no flag and no relationship', () => {
    for (const seed of SEEDS) {
      const { built, txns } = buildWith(control, seed);
      const delays = emiDelays(built, txns);
      expect(delays.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(
        delays.every((d) => d !== null && d >= 0 && d <= 2),
        `seed ${seed}`,
      ).toBe(true);
      expect(txns.filter((t) => t.type === 'repayment').every((t) => t.amountMinor > 0)).toBe(true);
      expect([built.flags, built.relationships]).toEqual([[], []]);
      expect(built.truth.months.every((m) => m.expected_band === 'routine')).toBe(true);
      expect(built.truth.onset_month).toBeNull();
    }
  });

  it('keeps its first big payment to a supplier well after the first 72 hours', () => {
    for (const seed of SEEDS) {
      const { built, txns } = buildWith(control, seed);
      const early = txns.filter(
        (t) =>
          t.type !== 'repayment' &&
          t.fromId === built.loan.accountEntityId &&
          Date.parse(t.at) - Date.parse(built.loan.disbursedAt) <= 72 * HOUR,
      );
      expect(early, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('slow_burn', () => {
  it('is on time before the onset, then later each month, then half paid, then missed', () => {
    for (const seed of SEEDS) {
      const { built, txns } = buildWith(slowBurn, seed);
      const delays = emiDelays(built, txns);
      const onset = monthsBetween(
        istDayOf(built.loan.disbursedAt).slice(0, 7),
        built.truth.onset_month ?? '',
      );
      expect(onset, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(delays.slice(0, onset - 1).every((d) => d !== null && d <= 2)).toBe(true);
      const stress = delays.slice(onset - 1);
      const paid = stress.filter((d): d is number => d !== null);
      expect(paid, `seed ${seed}`).toEqual([...paid].sort((a, b) => a - b));
      expect(paid[0], `seed ${seed}`).toBe(3);
      expect(stress.slice(5).every((d) => d === null)).toBe(true);
    }
  });

  it('pays half of the EMI from the fourth month of stress', () => {
    const { built, txns } = buildWith(slowBurn, 4);
    const disbursedOn = istDayOf(built.loan.disbursedAt);
    const onset = monthsBetween(disbursedOn.slice(0, 7), built.truth.onset_month ?? '');
    const full = txns.find((t) => t.type === 'repayment')?.amountMinor ?? 0;
    const fourth = txns.filter(
      (t) => t.type === 'repayment' && istDayOf(t.at) >= addMonths(disbursedOn, onset + 3),
    );
    expect(fourth[0]?.amountMinor).toBe(Math.floor(full / 2));
  });

  it('raises the band step by step and never lowers it; urgent starts at the first missed EMI', () => {
    for (const seed of SEEDS) {
      const { built } = buildWith(slowBurn, seed);
      const ranks = built.truth.months.map((m) => bandRank[m.expected_band]);
      expect(ranks, `seed ${seed}`).toEqual([...ranks].sort((a, b) => a - b));
      expect(ranks.at(-1), `seed ${seed}`).toBeGreaterThanOrEqual(1);
      const onsetIdx = built.truth.months.findIndex((m) => m.month === built.truth.onset_month);
      expect(ranks.slice(0, onsetIdx).every((r) => r === 0)).toBe(true);
      expect(built.truth.expected_rules).toEqual([]);
    }
  });
});

describe('sudden_enforcement', () => {
  it('keeps paying on time while an ED attachment, an allegation, appears after disbursement', () => {
    for (const seed of SEEDS) {
      const { built, txns } = buildWith(suddenEnforcement, seed);
      expect(
        emiDelays(built, txns).every((d) => d !== null && d <= 2),
        `seed ${seed}`,
      ).toBe(true);
      expect(built.flags).toHaveLength(1);
      const [flag] = built.flags;
      expect(flag?.evidence_status).toBe('allegation');
      expect(flag?.event.case_type).toBe('ed_provisional_attachment');
      expect(flag?.event.authority).toBe('SYNTHETIC');
      expect(flag?.event_date.slice(0, 7)).toBe(built.truth.onset_month);
      expect((flag?.event_date ?? '') > istDayOf(built.loan.disbursedAt)).toBe(true);
      expect(flag?.entity.canonical_name).toBe(built.entities[0]?.name);
    }
  });

  it('is routine until the flag month and urgent from then on', () => {
    for (const seed of SEEDS) {
      const { built } = buildWith(suddenEnforcement, seed);
      for (const m of built.truth.months)
        expect(m.expected_band, `seed ${seed} ${m.month}`).toBe(
          m.month >= (built.truth.onset_month ?? '') ? 'urgent' : 'routine',
        );
    }
  });
});

describe('fund_diversion', () => {
  it('moves 70% or more of the loan to a related party within 72 hours', () => {
    for (const seed of SEEDS) {
      const { built, txns } = buildWith(fundDiversion, seed);
      const out = txns.filter(
        (t) =>
          t.type !== 'repayment' &&
          t.fromId === built.loan.accountEntityId &&
          Date.parse(t.at) - Date.parse(built.loan.disbursedAt) <= 72 * HOUR,
      );
      const total = out.reduce((s, t) => s + t.amountMinor, 0);
      expect(total / built.loan.amountMinor, `seed ${seed}`).toBeGreaterThanOrEqual(0.7);
      const [rel] = built.relationships;
      expect(built.relationships).toHaveLength(1);
      expect(rel).toMatchObject({
        from: built.loan.borrowerId,
        type: 'shares_address',
        status: 'verified',
      });
      expect(out.every((t) => t.toId === `${rel?.to}-acc`)).toBe(true);
    }
  });

  it('keeps paying its EMIs on time afterwards and is labelled for both rules', () => {
    for (const seed of SEEDS) {
      const { built, txns } = buildWith(fundDiversion, seed);
      expect(
        emiDelays(built, txns).every((d) => d !== null && d <= 2),
        `seed ${seed}`,
      ).toBe(true);
      expect(built.truth.expected_rules).toEqual(['rapid_onward', 'linked_counterparty']);
      expect(built.truth.months.every((m) => m.expected_band === 'needs_attention')).toBe(true);
      expect(built.truth.onset_month).toBe(istDayOf(built.loan.disbursedAt).slice(0, 7));
    }
  });
});

describe('period lengths', () => {
  it('still builds and labels every scenario with a 12 and a 36 month period', () => {
    for (const months of [12, 36]) {
      const h = makeHorizon('2024-01', months);
      for (const a of [control, slowBurn, suddenEnforcement, fundDiversion])
        for (const seed of SEEDS) {
          const { built } = buildWith(a, seed, h);
          expect(built.truth.months.at(-1)?.month, `${a.id} ${months}`).toBe(
            addMonthsToMonth('2024-01', months - 1),
          );
        }
    }
  });
});
