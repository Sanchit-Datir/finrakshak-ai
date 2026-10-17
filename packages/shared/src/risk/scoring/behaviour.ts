import { istDate } from '../../time.js';
import type { RuleTransaction } from '../rules/types.js';
import { daysBetween } from './calc.js';
import { emiHistory, type EmiLoan, type EmiState } from './emi.js';
import type { ScoringSettings } from './settings.js';
import type { LayerResult, Reason, ReasonCode } from './types.js';

/**
 * Own behaviour drift layer (max 10), from the loan's own transactions only. An EMI is "unmet" when it
 * is missed, paid after the grace period, or paid short. One unmet EMI 4, two in a row 8, three or
 * more, or a delay that grows over three EMIs, 10; receipts falling over the last three months add up
 * to 2 within the cap. Monitoring rules do not count here (they feed the pattern layer only).
 */

export interface BehaviourInput {
  readonly loan: EmiLoan;
  /** The loan's transactions; later ones than `asOf` are ignored. */
  readonly transactions: readonly RuleTransaction[];
  readonly asOf: string;
}

type B = ScoringSettings['behaviour'];
const unmet = (e: EmiState): boolean => e.status === 'missed' || e.late || e.partial;

function longestRun(flags: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    run = f ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const unmetPoints = (emis: readonly EmiState[], b: B): number => {
  const flags = emis.map(unmet);
  const count = flags.filter(Boolean).length;
  if (count >= 3) return b.three_or_more_unmet;
  if (longestRun(flags) >= 2) return b.two_unmet_in_row;
  return count >= 1 ? b.one_unmet : 0;
};

/** The last N paid EMIs are each later than the one before, and the last is past the grace period. */
function growingDelay(emis: readonly EmiState[], b: B): EmiState[] | null {
  const paid = emis.filter((e) => e.status === 'paid').slice(-b.growing_delay_emis);
  if (paid.length < b.growing_delay_emis || !(paid[paid.length - 1]?.late ?? false)) return null;
  return paid.every((e, i) => i === 0 || e.daysLate > (paid[i - 1]?.daysLate ?? Infinity))
    ? paid
    : null;
}

/** Percent fall of receipts in the last 90 days against the 90 before (null when not comparable). */
export function receiptsFallPercent(input: BehaviourInput): number | null {
  if (daysBetween(input.loan.disbursedOn, input.asOf) < 180) return null;
  let last = 0;
  let before = 0;
  for (const t of input.transactions) {
    if (t.toId !== input.loan.accountEntityId || t.type === 'disbursement') continue;
    const age = daysBetween(istDate(t.at), input.asOf);
    if (age >= 0 && age < 90) last += t.amountMinor;
    else if (age >= 90 && age < 180) before += t.amountMinor;
  }
  if (before <= 0 || last >= before) return before <= 0 ? null : 0;
  return Math.floor(((before - last) * 100) / before);
}

const receiptsPoints = (fall: number | null, b: B): number =>
  fall === null
    ? 0
    : fall >= b.receipts_fall_large_percent
      ? b.receipts_fall_large
      : fall >= b.receipts_fall_small_percent
        ? b.receipts_fall_small
        : 0;

function reason(
  loanId: string,
  code: ReasonCode,
  pts: number,
  emis: readonly EmiState[],
  facts: Reason['facts'],
): Reason {
  return {
    code,
    layer: 'behaviour',
    reason_key: `${code}|${loanId}`,
    subject_id: loanId,
    points: pts,
    evidence_event_ids: emis.map((e) => e.transactionId ?? `emi:${loanId}:${e.no}`),
    evidence_statuses: emis.length > 0 ? ['fact'] : [],
    source: 'transactions',
    facts,
    pattern: null,
  };
}

const EMI_CODES: readonly [ReasonCode, (e: EmiState) => boolean][] = [
  ['missed_emi', (e) => e.status === 'missed'],
  ['partial_emi', (e) => e.partial],
  ['late_emi', (e) => e.late],
];

export function behaviourLayer(input: BehaviourInput, settings: ScoringSettings): LayerResult {
  const b = settings.behaviour;
  const id = input.loan.id;
  const emis = emiHistory(input.loan, input.transactions, input.asOf, {
    graceDays: b.grace_days,
    partialBelowPercent: b.partial_below_percent,
  })
    .filter((e) => e.status !== 'pending')
    .slice(-b.lookback_emis);
  const growing = growingDelay(emis, b);
  const countPts = unmetPoints(emis, b);
  const emiPts = Math.max(countPts, growing === null ? 0 : b.growing_delay);
  const reasons: Reason[] = [];
  let driver: ReasonCode | null =
    growing !== null && b.growing_delay > countPts ? 'growing_delay' : null;
  for (const [code, has] of EMI_CODES) {
    const hit = emis.filter(has);
    if (hit.length === 0) continue;
    driver ??= code;
    const maxLate = Math.max(...hit.map((e) => e.daysLate));
    const latest = hit[hit.length - 1]?.due ?? '';
    reasons.push(
      reason(id, code, driver === code ? emiPts : 0, hit, {
        count: hit.length,
        max_days_late: maxLate,
        latest_due: latest,
      }),
    );
  }
  if (growing !== null)
    reasons.push(
      reason(id, 'growing_delay', driver === 'growing_delay' ? emiPts : 0, growing, {
        count: growing.length,
        days: growing.map((e) => e.daysLate).join(','),
      }),
    );
  const fall = receiptsFallPercent(input);
  const fallPts = receiptsPoints(fall, b);
  if (fallPts > 0) reasons.push(reason(id, 'receipts_fall', fallPts, [], { percent: fall ?? 0 }));
  return { points: Math.min(settings.layer_max.behaviour, emiPts + fallPts), reasons };
}
