import { addDays, addMonths } from '../calendar.js';
import {
  MONEY_STEP,
  emiCount,
  extraTxn,
  healthyPlan,
  lifeTransactions,
  makeLoanBase,
  percent,
  roundTo,
  BANK_ACCOUNT_ID,
} from '../base.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/**
 * A look-alike: months in, the borrower repays 35–55% of the loan early, funded by one large receipt from
 * a customer, and its EMIs shrink to match. No EMI is missed. It must stay Routine review.
 */
export const bigPrepayment: Archetype = {
  id: 'big_prepayment',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const total = emiCount(base, ctx.horizon);
    const at = ctx.rng.int(3, Math.max(3, total - 3));
    const share = ctx.rng.int(35, 55);
    const healthy = healthyPlan(ctx);
    const life = lifeTransactions(base, ctx, {
      ...healthy,
      emi: (k) => (k > at ? { offsetDays: 1, percent: 100 - share } : healthy.emi(k)),
    });
    const prepaid = roundTo(percent(base.amount, share), MONEY_STEP);
    const payDay = addDays(addMonths(base.disbursedOn, at), 3);
    const funding = roundTo(percent(prepaid, 102), MONEY_STEP);
    const customer = base.customers[0]?.accountId ?? base.accountId;
    const extra = [
      extraTxn(base, 'P1', addDays(payDay, -2), customer, base.accountId, funding, 'rtgs'),
      extraTxn(base, 'P2', payDay, base.accountId, BANK_ACCOUNT_ID, prepaid, 'repayment'),
    ];
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'big_prepayment',
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
      transactions: [...life, ...extra],
      flags: [],
      truth,
    };
  },
};
