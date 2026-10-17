import { addMonthsToMonth } from '../calendar.js';
import { emiCount, healthyPlan, lifeTransactions, makeLoanBase } from '../base.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/**
 * HELD OUT (B-55): months with no receipts and no supplier payments (the EMIs come out of the unspent
 * loan), then two months of heavy movement. It is real unusual behaviour that no pattern or rule is
 * written for, and it comes after the first 90 days, where the monitoring rules look. The expected result
 * is that nothing is detected: Routine review, no alert. This checks the system does not claim more
 * than it knows.
 */
export const dormantBurst: Archetype = {
  id: 'dormant_burst',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const total = emiCount(base, ctx.horizon);
    const dormant = ctx.rng.int(Math.min(4, total - 3), Math.min(5, total - 3));
    const burst = (k: number): boolean => k > dormant && k <= dormant + 2;
    const transactions = lifeTransactions(
      base,
      ctx,
      healthyPlan(ctx, {
        useOfFunds: [],
        revenuePercent: (k) => (k <= dormant ? 0 : burst(k) ? 300 : 100),
        receiptCount: (k) => (burst(k) ? 8 : 2),
        paymentCount: (k) => (burst(k) ? 6 : 1),
      }),
    );
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'dormant_burst',
      class: 'held_out',
      onsetMonth: addMonthsToMonth(base.disbursedMonth, dormant),
      expectedRules: [],
      stateFor: () => ({ band: 'routine', reasons: [] }),
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
