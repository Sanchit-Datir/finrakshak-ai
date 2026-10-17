import { lifeTransactions, makeLoanBase } from '../base.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/** A healthy borrower: EMIs on time, steady receipts, nothing in the public records. */
export const control: Archetype = {
  id: 'control',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const jitter = Array.from({ length: 40 }, () => ctx.rng.int(0, 2));
    const transactions = lifeTransactions(base, ctx, {
      useOfFunds: [
        [ctx.rng.int(40, 55), 5, 15],
        [ctx.rng.int(15, 25), 20, 40],
      ],
      emi: (k) => ({ offsetDays: jitter[k - 1] ?? 0, percent: 100 }),
      revenuePercent: () => 100,
    });
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'control',
      class: 'control',
      onsetMonth: null,
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
