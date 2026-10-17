import { addDays } from '../calendar.js';
import {
  MONEY_STEP,
  extraTxn,
  healthyPlan,
  lifeTransactions,
  makeLoanBase,
  partyWithAccount,
  percent,
  roundTo,
} from '../base.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/**
 * Money leaves the borrower for an intermediary that is not linked to it and comes back within weeks,
 * through one or two parties. Trips `circular`, and nothing else: no relationship exists, and the first
 * transfer is well after the first 72 hours.
 */
export const roundTrip: Archetype = {
  id: 'round_trip',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const hops = ctx.rng.pick([1, 1, 2] as const);
    const ids = Array.from({ length: hops }, (_, i) => `B-${base.no}-R${i + 1}`);
    const entities = [
      ...base.entities,
      ...ids.flatMap((id, i) =>
        partyWithAccount(id, 'counterparty', `SYNTH Intermediary ${base.no}-R${i + 1}`),
      ),
    ];
    const life = lifeTransactions(
      base,
      ctx,
      healthyPlan(ctx, { useOfFunds: [[ctx.rng.int(15, 25), 10, 20]] }),
    );
    const first = roundTo(percent(base.amount, ctx.rng.int(20, 35)), MONEY_STEP);
    const back = roundTo(percent(first, ctx.rng.int(60, 95)), MONEY_STEP);
    const nodes = [base.accountId, ...ids.map((id) => `${id}-acc`), base.accountId];
    let day = addDays(base.disbursedOn, ctx.rng.int(5, 12));
    const legs = nodes.slice(0, -1).map((from, i) => {
      if (i > 0) day = addDays(day, ctx.rng.int(1, 4));
      return extraTxn(
        base,
        `X${i + 1}`,
        day,
        from,
        nodes[i + 1] ?? base.accountId,
        i === 0 ? first : back,
        'rtgs',
      );
    });
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'round_trip',
      class: 'defaulter',
      onsetMonth: base.disbursedMonth,
      expectedRules: ['circular'],
      stateFor: () => ({ band: 'needs_attention', reasons: ['circular'] }),
    });
    return {
      entities,
      relationships: [],
      loan: base.loan,
      tenor: base.tenor,
      transactions: [...life, ...legs],
      flags: [],
      truth,
    };
  },
};
