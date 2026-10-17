import {
  SYNTH_ARCHETYPES,
  SynthEntitySchema,
  SynthFlagSchema,
  SynthLoanSchema,
  SynthManifestSchema,
  SynthRelationshipSchema,
  SynthTransactionSchema,
  SynthTruthSchema,
  detectMonitoring,
  type MonitoringDetection,
  type RuleConfig,
} from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from './archetypes/index.js';
import { PLAN_ALLOCATION, groupSizes, scaleAllocation } from './allocation.js';
import { istMonthOf, monthEnd, monthRange, onOrBeforeMonthEnd } from './calendar.js';
import { checkLedger } from './ledger.js';
import { generate, type SynthDataset } from './generate.js';
import { findRealLookingIdentifiers } from './guards.js';
import { serialise } from './output.js';

/** The app's default thresholds (web/src/demo/seed.ts), which the labels are written against. */
const CONFIG: RuleConfig = {
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
const ALL = {
  control: 2,
  slow_burn: 2,
  sudden_enforcement: 2,
  round_trip: 2,
  fund_diversion: 2,
  contagion: 2,
  shared_address: 5,
  cash_split: 2,
  dormant_burst: 2,
  seasonal: 2,
  big_prepayment: 2,
  near_threshold: 2,
} as const;
const SMALL = { control: 4, slow_burn: 3, sudden_enforcement: 3, fund_diversion: 3 } as const;

/** Rule ids raised for each loan, using the same code the app and the scoring job use. */
function rulesByLoan(d: SynthDataset): Map<string, string[]> {
  const detections: MonitoringDetection[] = detectMonitoring({
    loans: d.loans,
    transactions: d.transactions,
    entities: d.entities,
    relationships: d.relationships,
    config: CONFIG,
  });
  const out = new Map<string, string[]>(d.loans.map((l) => [l.id, []]));
  for (const x of detections) {
    const loans = x.rule === 'repeated_counterparty' ? x.loanIds : [x.loanId];
    for (const id of loans) out.get(id)?.push(x.rule);
  }
  return out;
}

describe('allocation', () => {
  it('is the 200 customers of the plan', () => {
    expect(Object.values(PLAN_ALLOCATION).reduce((s, n) => s + n, 0)).toBe(200);
    expect(scaleAllocation(200)).toEqual(PLAN_ALLOCATION);
  });
  it('always adds up to the total asked for, for every total up to 400', () => {
    for (let total = 0; total <= 400; total++)
      expect(
        Object.values(scaleAllocation(total)).reduce((s, n) => s + n, 0),
        String(total),
      ).toBe(total);
  });
  it('hands the leftovers to the largest remainders, earlier scenario first on a tie', () => {
    expect(scaleAllocation(1).control).toBe(1);
    expect(scaleAllocation(12)).toMatchObject({ control: 3, slow_burn: 1, sudden_enforcement: 1 });
  });
  it('splits loans into groups, merging a lone last loan into the group before', () => {
    expect(groupSizes(15, 5)).toEqual([5, 5, 5]);
    expect(groupSizes(7, 5)).toEqual([5, 2]);
    expect(groupSizes(11, 5)).toEqual([5, 6]);
    expect(groupSizes(6, 5)).toEqual([6]);
    expect(groupSizes(2, 5)).toEqual([2]);
    expect(groupSizes(1, 5)).toEqual([1]);
    expect(groupSizes(0, 5)).toEqual([]);
    for (let n = 2; n < 60; n++) expect(groupSizes(n, 5).reduce((a, b) => a + b, 0)).toBe(n);
    expect(() => groupSizes(5, 1)).toThrow(RangeError);
  });

  it('rejects a total that is not a whole number', () => {
    expect(() => scaleAllocation(-1)).toThrow(RangeError);
    expect(() => scaleAllocation(1.5)).toThrow(RangeError);
  });
});

describe('generate', () => {
  const d = generate({ seed: 7, allocation: SMALL });

  it('is deterministic: the same options give byte-identical files and hashes', () => {
    const a = serialise(generate({ seed: 7, allocation: SMALL }));
    const b = serialise(d);
    expect(a.files).toEqual(b.files);
    expect(a.manifest).toEqual(b.manifest);
    expect(serialise(generate({ seed: 8, allocation: SMALL })).manifest.sha256).not.toEqual(
      a.manifest.sha256,
    );
  });

  it('leaves earlier scenarios unchanged when the last built scenario gets more customers', () => {
    const more = generate({ seed: 7, allocation: { ...SMALL, fund_diversion: 6 } });
    const earlier = (x: SynthDataset): SynthDataset['loans'] =>
      x.loans.filter((l) => Number(l.id.slice(2)) <= 10);
    expect(earlier(more)).toEqual(earlier(d));
    expect(more.loans).toHaveLength(16);
  });

  it('builds the customers asked for, scenario by scenario', () => {
    expect(d.loans).toHaveLength(13);
    expect(d.truth.filter((t) => t.archetype === 'slow_burn')).toHaveLength(3);
    const partial = generate({ seed: 1, allocation: { control: 1, round_trip: 2 } });
    expect(partial.loans).toHaveLength(3);
    expect(partial.notBuilt).toEqual([]);
    expect(Object.keys(ARCHETYPES)).toHaveLength(12);
  });

  it('keeps every row valid under the shared schemas, with unique ids and no dangling references', () => {
    d.entities.forEach((e) => SynthEntitySchema.parse(e));
    d.relationships.forEach((r) => SynthRelationshipSchema.parse(r));
    d.loans.forEach((l) => SynthLoanSchema.parse(l));
    d.transactions.forEach((t) => SynthTransactionSchema.parse(t));
    d.flags.forEach((f) => SynthFlagSchema.parse(f));
    d.truth.forEach((t) => SynthTruthSchema.parse(t));
    const ids = new Set(d.entities.map((e) => e.id));
    expect(ids.size).toBe(d.entities.length);
    for (const t of d.transactions)
      expect([ids.has(t.fromId), ids.has(t.toId)]).toEqual([true, true]);
    for (const r of d.relationships) expect([ids.has(r.from), ids.has(r.to)]).toEqual([true, true]);
    for (const l of d.loans)
      expect([ids.has(l.borrowerId), ids.has(l.accountEntityId)]).toEqual([true, true]);
    expect(new Set(d.entities.map((e) => e.name)).size).toBe(d.entities.length);
  });

  it('writes only SYNTH names and nothing that looks like a real identifier (B-54)', () => {
    expect(d.entities.every((e) => e.name.startsWith('SYNTH '))).toBe(true);
    const { files } = serialise(d);
    for (const [name, text] of Object.entries(files))
      expect(findRealLookingIdentifiers(text), name).toEqual([]);
  });

  it('keeps transactions in time order, as whole paise, inside the period', () => {
    const times = d.transactions.map((t) => Date.parse(t.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(
      d.transactions.every((t) => Number.isSafeInteger(t.amountMinor) && t.amountMinor > 0),
    ).toBe(true);
    expect(d.transactions.every((t) => onOrBeforeMonthEnd(t.at, '2025-12'))).toBe(true);
  });

  it('gives each loan a truth row for every month from its disbursement month to the end', () => {
    for (const t of d.truth) {
      const loan = d.loans.find((l) => l.id === t.loan_id);
      const months = t.months.map((m) => m.month);
      expect(months[0]).toBe(istMonthOf(loan?.disbursedAt ?? ''));
      expect(months.at(-1)).toBe('2025-12');
      expect(months).toEqual(monthRange(months[0] ?? '', months.length));
    }
  });

  it('rejects a period outside 12 to 36 months', () => {
    expect(() => generate({ seed: 1, months: 11, allocation: SMALL })).toThrow(RangeError);
    expect(() => generate({ seed: 1, months: 37, allocation: SMALL })).toThrow(RangeError);
  });

  it('produces a valid manifest', () => {
    const { manifest } = serialise(d);
    expect(SynthManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.counts['loans']).toBe(13);
    expect(manifest.counts['archetype_control']).toBe(4);
  });
});

describe('across many seeds', () => {
  const seeds = Array.from({ length: 25 }, (_, i) => i + 1);

  it('never overdraws the borrower account (the ledger holds)', () => {
    for (const seed of seeds) {
      const x = generate({ seed, allocation: ALL });
      for (const l of x.loans) {
        const mine = x.transactions.filter((t) => t.loanId === l.id);
        expect(
          checkLedger(new Map([[l.accountEntityId, 0]]), mine),
          `seed ${seed} ${l.id}`,
        ).toEqual([]);
      }
    }
  });

  it('trips exactly the monitoring rules the labels expect, no more and no fewer', () => {
    for (const seed of seeds) {
      const x = generate({ seed, allocation: ALL });
      const rules = rulesByLoan(x);
      for (const t of x.truth)
        expect(
          [...(rules.get(t.loan_id) ?? [])].sort(),
          `seed ${seed} ${t.loan_id} ${t.archetype}`,
        ).toEqual([...t.expected_rules].sort());
    }
  });

  it('does the same with a short and a long period', () => {
    for (const months of [12, 18, 36]) {
      const x = generate({ seed: 3, months, allocation: ALL });
      const rules = rulesByLoan(x);
      for (const t of x.truth)
        expect([...(rules.get(t.loan_id) ?? [])].sort(), `${months} months ${t.archetype}`).toEqual(
          [...t.expected_rules].sort(),
        );
    }
  });

  it('keeps every flag after its loan was disbursed and inside the period', () => {
    for (const seed of seeds) {
      const x = generate({ seed, allocation: ALL });
      for (const f of x.flags) {
        const loan = x.loans.find((l) => l.id === `L-${f.flag_id.slice(2, 6)}`);
        expect(
          f.event_date > (loan?.disbursedAt.slice(0, 10) ?? '9999'),
          `seed ${seed} ${f.flag_id}`,
        ).toBe(true);
        expect(f.event_date <= monthEnd('2025-12')).toBe(true);
      }
    }
  });

  it('covers every scenario name in the shared list', () => {
    expect(SYNTH_ARCHETYPES).toHaveLength(12);
  });
});

describe('the full plan (200 customers)', () => {
  const full = generate({ seed: 20261017, allocation: PLAN_ALLOCATION });

  it('builds exactly the plan’s customers for every scenario, none left out', () => {
    expect(full.loans).toHaveLength(200);
    expect(full.notBuilt).toEqual([]);
    for (const id of SYNTH_ARCHETYPES)
      expect(
        full.truth.filter((t) => t.archetype === id),
        id,
      ).toHaveLength(PLAN_ALLOCATION[id]);
  });

  it('trips exactly the labelled monitoring rules on every one of the 200 loans', () => {
    const rules = rulesByLoan(full);
    const mismatches = full.truth.filter(
      (t) =>
        [...(rules.get(t.loan_id) ?? [])].sort().join() !== [...t.expected_rules].sort().join(),
    );
    expect(mismatches.map((t) => `${t.loan_id} ${t.archetype}`)).toEqual([]);
  });

  it('leaves the look-alikes and the held-out scenario with no rule and a Routine review all along', () => {
    for (const t of full.truth.filter((x) => x.class === 'lookalike' || x.class === 'held_out')) {
      expect(t.expected_rules, t.archetype).toEqual([]);
      expect(
        t.months.every((m) => m.expected_band === 'routine'),
        t.archetype,
      ).toBe(true);
    }
  });

  it('never lowers the band of a defaulter once it has risen', () => {
    const rank = { routine: 0, needs_attention: 1, urgent: 2 } as const;
    for (const t of full.truth.filter((x) => x.class === 'defaulter')) {
      const ranks = t.months.map((m) => rank[m.expected_band]);
      expect(ranks, `${t.loan_id} ${t.archetype}`).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('keeps every name unique and synthetic, and every file free of real-looking identifiers', () => {
    expect(new Set(full.entities.map((e) => e.name)).size).toBe(full.entities.length);
    for (const [name, text] of Object.entries(serialise(full).files))
      expect(findRealLookingIdentifiers(text), name).toEqual([]);
  });

  it('is reproducible: the same seed gives the same hashes', () => {
    const again = generate({ seed: 20261017, allocation: PLAN_ALLOCATION });
    expect(serialise(again).manifest.sha256).toEqual(serialise(full).manifest.sha256);
  });
});
