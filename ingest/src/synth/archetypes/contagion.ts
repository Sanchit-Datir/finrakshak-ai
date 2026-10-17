import { addDays, addMonthsToMonth, monthStart } from '../calendar.js';
import { emiCount, healthyPlan, lifeTransactions, makeLoanBase } from '../base.js';
import { makeFlag } from '../flags.js';
import { buildTruth, carryForward, type MonthState } from '../truth.js';
import type { Archetype } from './types.js';

/** Share of the monthly receipts each of the three customers pays, in percent. */
const SHARES = [45, 35, 20] as const;
/** Days late in the first, second and later months after the top customer fails. */
const DELAYS = [6, 11, 16] as const;

/**
 * The borrower's biggest customer (45% of receipts) is taken to insolvency. It stops paying, receipts
 * fall, and the borrower's EMIs slip a little more each month. The borrower itself has no public record.
 * Trips no monitoring rule; the scoring should see it through the customer link and the late EMIs.
 */
export const contagion: Archetype = {
  id: 'contagion',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const total = emiCount(base, ctx.horizon);
    const onset = Math.max(3, total - ctx.rng.int(3, 4));
    const month = addMonthsToMonth(base.disbursedMonth, onset);
    const flagDate = addDays(monthStart(month), ctx.rng.int(0, 27));
    const stress = (k: number): number => k - onset + 1;
    const healthy = healthyPlan(ctx);
    const transactions = lifeTransactions(base, ctx, {
      ...healthy,
      customerShares: SHARES,
      receiptFrom: (k, i) => !(i === 0 && stress(k) >= 1),
      emi: (k) =>
        stress(k) >= 1
          ? { offsetDays: DELAYS[Math.min(stress(k), 3) - 1] ?? 16, percent: 100 }
          : healthy.emi(k),
    });
    const topCustomer = base.entities.find((e) => e.id === base.customers[0]?.id);
    const flag = makeFlag(
      base,
      {
        caseType: 'ibbi_cirp',
        sourceId: 'ibbi',
        status: 'fact',
        date: flagDate,
        title: `SYNTH CIRP initiated: ${topCustomer?.name ?? 'customer'}`,
        proceedingStatus: 'cirp_initiated',
      },
      { suffix: 'C1', name: topCustomer?.name ?? 'SYNTH Customer' },
    );
    const stateOf = (i: number): MonthState => {
      const s = stress(i);
      if (i > total || s <= 0) return { band: 'routine', reasons: [] };
      return s >= 3
        ? { band: 'needs_attention', reasons: ['customer_flagged', 'late_emi'] }
        : { band: 'routine', reasons: ['customer_flagged'] };
    };
    const states = carryForward(Array.from({ length: ctx.horizon.months }, (_, i) => stateOf(i)));
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'contagion',
      class: 'defaulter',
      onsetMonth: month,
      expectedRules: [],
      stateFor: (i) => states[i] ?? { band: 'routine', reasons: [] },
    });
    return {
      entities: base.entities,
      relationships: [],
      loan: base.loan,
      tenor: base.tenor,
      transactions,
      flags: [flag],
      truth,
    };
  },
};
