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

/** The ₹1 lakh reference amount of the app's cash rule, in paise. */
export const CASH_REFERENCE = 10_000_000;

/**
 * Three to five cash withdrawals, each just under ₹1 lakh, within a few days of each other, a couple of
 * weeks after disbursement. Trips `cash_split` only.
 */
export const cashSplit: Archetype = {
  id: 'cash_split',
  build(ctx) {
    const base = makeLoanBase(ctx, { minAmount: 100_000_000 });
    const payee = `B-${base.no}-CASH`;
    const entities = [
      ...base.entities,
      ...partyWithAccount(payee, 'counterparty', `SYNTH Cash payee ${base.no}`),
    ];
    const life = lifeTransactions(base, ctx, healthyPlan(ctx, { useOfFunds: [[25, 5, 15]] }));
    const count = ctx.rng.int(3, 5);
    let day = addDays(base.disbursedOn, ctx.rng.int(10, 30));
    const withdrawals = Array.from({ length: count }, (_, i) => {
      if (i > 0) day = addDays(day, ctx.rng.int(0, 1));
      const amount = roundTo(percent(CASH_REFERENCE, ctx.rng.int(92, 98)), MONEY_STEP);
      return extraTxn(
        base,
        `W${i + 1}`,
        day,
        base.accountId,
        `${payee}-acc`,
        amount,
        'cash_withdrawal',
        [12, i * 10],
      );
    });
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'cash_split',
      class: 'defaulter',
      onsetMonth: base.disbursedMonth,
      expectedRules: ['cash_split'],
      stateFor: () => ({ band: 'needs_attention', reasons: ['cash_split'] }),
    });
    return {
      entities,
      relationships: [],
      loan: base.loan,
      tenor: base.tenor,
      transactions: [...life, ...withdrawals],
      flags: [],
      truth,
    };
  },
};
