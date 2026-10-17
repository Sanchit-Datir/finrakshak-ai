import { addDays, addMonthsToMonth, monthStart } from '../calendar.js';
import { emiCount, lifeTransactions, makeLoanBase } from '../base.js';
import { makeFlag } from '../flags.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/**
 * Transactions stay normal; an ED provisional attachment on the borrower appears months after
 * disbursement. Only the public record changes (an allegation, B-36); the owner's rule sends it straight
 * to Urgent review.
 */
export const suddenEnforcement: Archetype = {
  id: 'sudden_enforcement',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const total = emiCount(base, ctx.horizon);
    const onset = ctx.rng.int(2, Math.max(2, total - 1));
    const onsetMonth = addMonthsToMonth(base.disbursedMonth, onset);
    const flagDate = addDays(monthStart(onsetMonth), ctx.rng.int(0, 27));
    const jitter = Array.from({ length: 40 }, () => ctx.rng.int(0, 2));
    const transactions = lifeTransactions(base, ctx, {
      useOfFunds: [
        [ctx.rng.int(40, 55), 5, 15],
        [ctx.rng.int(15, 25), 20, 40],
      ],
      emi: (k) => ({ offsetDays: jitter[k - 1] ?? 0, percent: 100 }),
      revenuePercent: () => 100,
    });
    const flag = makeFlag(base, {
      caseType: 'ed_provisional_attachment',
      sourceId: 'ed',
      status: 'allegation',
      date: flagDate,
      title: `SYNTH ED provisional attachment: ${base.name}`,
      proceedingStatus: 'provisional_attachment',
    });
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'sudden_enforcement',
      class: 'defaulter',
      onsetMonth,
      expectedRules: [],
      stateFor: (i) =>
        i >= onset
          ? { band: 'urgent', reasons: ['public_record_after_disbursement'] }
          : { band: 'routine', reasons: [] },
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
