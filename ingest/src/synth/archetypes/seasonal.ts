import { healthyPlan, lifeTransactions, makeLoanBase } from '../base.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/** Receipts by month of the year as a percent of normal: a long thin spell, a harvest, a thin spell. */
const SEASON = [80, 80, 80, 280, 280, 200, 120, 80, 80, 80, 80, 100] as const;

/**
 * A look-alike: receipts swing between 80% and 280% of normal with the season, but every EMI is paid on
 * time. It must stay Routine review, with no alert.
 */
export const seasonal: Archetype = {
  id: 'seasonal',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const phase = ctx.rng.int(0, 11);
    const transactions = lifeTransactions(
      base,
      ctx,
      healthyPlan(ctx, { revenuePercent: (k) => SEASON[(k + phase) % 12] ?? 100 }),
    );
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'seasonal',
      class: 'lookalike',
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
