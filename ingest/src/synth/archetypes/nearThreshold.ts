import { HOUR, addDays, shiftInstant } from '../calendar.js';
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
import { CASH_REFERENCE } from './cashSplit.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/**
 * Stays just under each monitoring rule: 66–69% of the loan out in 72 hours (the rule needs 70%), a
 * loop that returns 44–48% (it needs 50%), and only two withdrawals just under ₹1 lakh (it needs three).
 * Nothing should be raised. The edges are the point.
 */
export const nearThreshold: Archetype = {
  id: 'near_threshold',
  build(ctx) {
    const base = makeLoanBase(ctx, { minAmount: 150_000_000 });
    const intermediary = `B-${base.no}-R1`;
    const payee = `B-${base.no}-CASH`;
    const entities = [
      ...base.entities,
      ...partyWithAccount(intermediary, 'counterparty', `SYNTH Intermediary ${base.no}-R1`),
      ...partyWithAccount(payee, 'counterparty', `SYNTH Cash payee ${base.no}`),
    ];
    const life = lifeTransactions(base, ctx, healthyPlan(ctx, { useOfFunds: [] }));
    const supplier = base.suppliers[0]?.accountId ?? base.accountId;
    const early = {
      ...extraTxn(
        base,
        'N1',
        base.disbursedOn,
        base.accountId,
        supplier,
        roundTo(percent(base.amount, ctx.rng.int(66, 69)), MONEY_STEP),
        'rtgs',
      ),
      at: shiftInstant(base.loan.disbursedAt, ctx.rng.int(2 * HOUR, 70 * HOUR)),
    };
    const out = roundTo(percent(base.amount, ctx.rng.int(10, 14)), MONEY_STEP);
    const returned = Math.floor(percent(out, ctx.rng.int(44, 48)) / MONEY_STEP) * MONEY_STEP;
    if ((returned * 100) / out >= 50)
      throw new RangeError('near_threshold loop must return under 50%');
    const loopDay = addDays(base.disbursedOn, ctx.rng.int(6, 12));
    const loop = [
      extraTxn(base, 'N2', loopDay, base.accountId, `${intermediary}-acc`, out, 'rtgs'),
      extraTxn(
        base,
        'N3',
        addDays(loopDay, ctx.rng.int(2, 6)),
        `${intermediary}-acc`,
        base.accountId,
        returned,
        'rtgs',
      ),
    ];
    const cashDay = addDays(base.disbursedOn, ctx.rng.int(14, 25));
    const cash = [0, 1].map((i) =>
      extraTxn(
        base,
        `N${4 + i}`,
        addDays(cashDay, i * ctx.rng.int(0, 5)),
        base.accountId,
        `${payee}-acc`,
        roundTo(percent(CASH_REFERENCE, ctx.rng.int(91, 98)), MONEY_STEP),
        'cash_withdrawal',
      ),
    );
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'near_threshold',
      class: 'lookalike',
      onsetMonth: null,
      expectedRules: [],
      stateFor: () => ({ band: 'routine', reasons: [] }),
    });
    return {
      entities,
      relationships: [],
      loan: base.loan,
      tenor: base.tenor,
      transactions: [...life, early, ...loop, ...cash],
      flags: [],
      truth,
    };
  },
};
