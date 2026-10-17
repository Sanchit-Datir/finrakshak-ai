import { HOUR, shiftInstant } from '../calendar.js';
import {
  MONEY_STEP,
  lifeTransactions,
  makeLoanBase,
  pad,
  partyWithAccount,
  percent,
  roundTo,
} from '../base.js';
import { buildTruth } from '../truth.js';
import type { Archetype } from './types.js';

/**
 * Most of the loan leaves within three days to a related party that shares the borrower's address. The
 * borrower then keeps paying EMIs, so only the early transfer shows. Trips `rapid_onward` and
 * `linked_counterparty`.
 */
export const fundDiversion: Archetype = {
  id: 'fund_diversion',
  build(ctx) {
    const base = makeLoanBase(ctx);
    const relatedId = `B-${base.no}-R1`;
    const entities = [
      ...base.entities,
      ...partyWithAccount(relatedId, 'counterparty', `SYNTH Related party ${base.no}-R1`),
    ];
    const jitter = Array.from({ length: 40 }, () => ctx.rng.int(0, 2));
    const life = lifeTransactions(base, ctx, {
      useOfFunds: [],
      emi: (k) => ({ offsetDays: jitter[k - 1] ?? 0, percent: 100 }),
      revenuePercent: () => 100,
    });
    const diversion = {
      id: `T-${base.no}-D001`,
      loanId: base.loanId,
      at: shiftInstant(base.loan.disbursedAt, ctx.rng.int(3 * HOUR, 36 * HOUR)),
      fromId: base.accountId,
      toId: `${relatedId}-acc`,
      amountMinor: roundTo(percent(base.amount, ctx.rng.int(72, 85)), MONEY_STEP),
      type: 'rtgs' as const,
    };
    const relationship = {
      id: `R-${pad(ctx.n, 4)}`,
      from: base.borrowerId,
      to: relatedId,
      type: 'shares_address' as const,
      status: 'verified' as const,
      source: 'SYNTH test',
      observedAt: base.disbursedOn,
      evidence: 'SYNTH test',
      synthetic: true as const,
    };
    const truth = buildTruth(base, ctx.horizon, {
      archetype: 'fund_diversion',
      class: 'defaulter',
      onsetMonth: base.disbursedMonth,
      expectedRules: ['rapid_onward', 'linked_counterparty'],
      stateFor: () => ({
        band: 'needs_attention',
        reasons: ['rapid_onward', 'linked_counterparty'],
      }),
    });
    return {
      entities,
      relationships: [relationship],
      loan: base.loan,
      tenor: base.tenor,
      transactions: [...life, diversion],
      flags: [],
      truth,
    };
  },
};
