import { addDays, addMonthsToMonth, monthStart } from '../calendar.js';
import {
  MONEY_STEP,
  defaultMaxStart,
  emiCount,
  extraTxn,
  healthyPlan,
  lifeTransactions,
  makeLoanBase,
  pad,
  partyWithAccount,
  synthRelationship,
} from '../base.js';
import { makeFlag } from '../flags.js';
import { buildTruth, type MonthState } from '../truth.js';
import type { BuiltLoan, GroupArchetype } from './types.js';

/**
 * A cluster of borrowers at one address (the first is the hub) that all pay the same payee within weeks,
 * which trips `repeated_counterparty` for each. Months later the hub gets an ED attachment (an
 * allegation); the others are linked to it by the shared address. A cluster of one loan has no common
 * payee and trips nothing.
 */
export const sharedAddress: GroupArchetype = {
  id: 'shared_address',
  groupSize: 5,
  buildGroup(contexts, rng): BuiltLoan[] {
    const first = contexts[0];
    if (first === undefined) return [];
    const horizon = first.horizon;
    const start = addMonthsToMonth(horizon.startMonth, rng.int(0, defaultMaxStart(horizon.months)));
    const baseDay = `${start}-${pad(rng.int(1, 10), 2)}`;
    const bases = contexts.map((c) =>
      makeLoanBase(c, { disbursedOn: addDays(baseDay, rng.int(0, 12)) }),
    );
    const hub = bases[0];
    if (hub === undefined) return [];
    const clustered = bases.length >= 2;
    const payee = `G-${hub.no}-Z`;
    const total = emiCount(hub, horizon);
    const onset = rng.int(3, Math.max(3, total - 1));
    const flagMonth = addMonthsToMonth(hub.disbursedMonth, onset);
    const flagDate = addDays(monthStart(flagMonth), rng.int(0, 27));
    return bases.map((base, i) => {
      const ctx = contexts[i];
      if (ctx === undefined) throw new Error('missing context');
      const life = lifeTransactions(
        base,
        ctx,
        healthyPlan(ctx, { useOfFunds: [[ctx.rng.int(30, 40), 5, 15]] }),
      );
      const pay = clustered
        ? [
            extraTxn(
              base,
              'Z1',
              addDays(base.disbursedOn, rng.int(5, 25)),
              base.accountId,
              `${payee}-acc`,
              rng.amount(10_000_000, 20_000_000, MONEY_STEP),
              'neft',
            ),
          ]
        : [];
      const isHub = i === 0;
      const stateOf = (month: string): MonthState => {
        const base0: MonthState = clustered
          ? { band: 'needs_attention', reasons: ['repeated_counterparty'] }
          : { band: 'routine', reasons: [] };
        if (month < flagMonth) return base0;
        return isHub
          ? {
              band: 'urgent',
              reasons: ['repeated_counterparty', 'public_record_after_disbursement'],
            }
          : { band: base0.band, reasons: [...base0.reasons, 'shared_address_with_flagged'] };
      };
      return {
        entities: [
          ...base.entities,
          ...(isHub && clustered
            ? partyWithAccount(payee, 'counterparty', `SYNTH Common payee ${hub.no}`)
            : []),
        ],
        relationships: isHub
          ? []
          : [
              synthRelationship(
                `R-${base.no}`,
                base.borrowerId,
                hub.borrowerId,
                'shares_address',
                base.disbursedOn,
              ),
            ],
        loan: base.loan,
        tenor: base.tenor,
        transactions: [...life, ...pay],
        flags: isHub
          ? [
              makeFlag(base, {
                caseType: 'ed_provisional_attachment',
                sourceId: 'ed',
                status: 'allegation',
                date: flagDate,
                title: `SYNTH ED provisional attachment: ${base.name}`,
                proceedingStatus: 'provisional_attachment',
              }),
            ]
          : [],
        truth: buildTruth(base, horizon, {
          archetype: 'shared_address',
          class: 'defaulter',
          onsetMonth: base.disbursedMonth,
          expectedRules: clustered ? ['repeated_counterparty'] : [],
          stateFor: (_index, month) => stateOf(month),
        }),
      };
    });
  },
};
