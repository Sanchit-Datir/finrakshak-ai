import { addMonthsToMonth } from '../calendar.js';
import { emiCount, lifeTransactions, makeLoanBase } from '../base.js';
import { buildTruth, carryForward, type MonthState } from '../truth.js';
import type { Archetype } from './types.js';

/** Days late by the nth month of stress; the sixth month is a missed EMI. */
const DELAYS = [3, 7, 12, 18, 25] as const;
/** Up to this many days late is within a normal grace period. */
const GRACE_DAYS = 5;

/**
 * A borrower that fails slowly: EMIs arrive later each month, then only half is paid, then nothing, while
 * receipts shrink. No monitoring rule fires; the scoring's behaviour layer should see it.
 */
export const slowBurn: Archetype = {
  id: 'slow_burn',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const total = emiCount(base, ctx.horizon);
    const onset = ctx.rng.int(3, Math.max(3, total - 6));
    const jitter = Array.from({ length: 40 }, () => ctx.rng.int(0, 2));
    const stress = (k: number): number => k - onset + 1;
    const transactions = lifeTransactions(base, ctx, {
      useOfFunds: [
        [ctx.rng.int(40, 55), 5, 15],
        [ctx.rng.int(15, 25), 20, 40],
      ],
      emi: (k) => {
        const s = stress(k);
        if (s <= 0) return { offsetDays: jitter[k - 1] ?? 0, percent: 100 };
        if (s >= 6) return { offsetDays: null, percent: 0 };
        return { offsetDays: DELAYS[s - 1] ?? 25, percent: s >= 4 ? 50 : 100 };
      },
      revenuePercent: (k) => (stress(k) <= 0 ? 100 : Math.max(40, 100 - 10 * stress(k))),
    });
    const stateOf = (i: number): MonthState => {
      const s = stress(i);
      if (i > total || s <= 0) return { band: 'routine', reasons: [] };
      if (s >= 6) return { band: 'urgent', reasons: ['late_emi', 'partial_emi', 'missed_emi'] };
      if (s >= 4) return { band: 'needs_attention', reasons: ['late_emi', 'partial_emi'] };
      return (DELAYS[s - 1] ?? 0) > GRACE_DAYS
        ? { band: 'needs_attention', reasons: ['late_emi'] }
        : { band: 'routine', reasons: [] };
    };
    const states = carryForward(Array.from({ length: ctx.horizon.months }, (_, i) => stateOf(i)));
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'slow_burn',
      class: 'defaulter',
      onsetMonth: addMonthsToMonth(base.disbursedMonth, onset),
      expectedRules: [],
      stateFor: (i) => states[i] ?? { band: 'routine', reasons: [] },
    });
    return {
      entities: base.entities,
      relationships: [],
      loan: base.loan,
      tenor: base.tenor,
      transactions,
      flags: [],
      truth,
    };
  },
};
