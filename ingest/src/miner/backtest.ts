import {
  addMonthsToDate,
  approxMonthsBetween,
  matchDefinition,
  type CandidateStats,
  type PatternDefinition,
  type TimelineEvent,
} from '@finrakshak-ai/shared';
import type { SeedCase } from './seedTimelines.js';
import { percentile, round1 } from './stats.js';

export type SequenceDefinition = Extract<PatternDefinition, { template: 'sequence' }>;

/** A seed case that shows a pattern: the events it matched, in order, the last being the outcome. */
export interface Support {
  readonly case_id: string;
  readonly matched: readonly TimelineEvent[];
}

const PLACEHOLDER_ID = 'pat_0000000000000000';

/**
 * The seed cases a definition fits. One vote per case (B-60), however many events it has. The outcome
 * must be the case's FIRST insolvency or liquidation record, so a pattern cannot be supported by steps
 * that came after the case had already failed.
 */
export function supportOf(def: SequenceDefinition, seeds: readonly SeedCase[]): Support[] {
  const out: Support[] = [];
  for (const seed of seeds) {
    if (seed.firstOutcome === null) continue;
    const r = matchDefinition(PLACEHOLDER_ID, def, seed.timeline, []);
    if (r?.strength !== 1 || r.matched_event_ids.at(-1) !== seed.firstOutcome.event_id) continue;
    const byId = new Map(seed.timeline.events.map((e) => [e.event_id, e]));
    out.push({
      case_id: seed.case_id,
      matched: r.matched_event_ids.flatMap((id) => byId.get(id) ?? []),
    });
  }
  return out;
}

/**
 * Leave-one-out: would the pattern still reach the minimum support if each supporting case were removed?
 * With exactly the minimum support, losing either case fails it by construction; the failure is reported
 * to the reviewer and is not a reason to drop the candidate (owner's decision: propose at 2 cases).
 */
export function leaveOneOut(
  support: readonly Support[],
  minSupport: number,
): CandidateStats['leave_one_out'] {
  const failed = support.length - 1 < minSupport ? support.map((s) => s.case_id).sort() : [];
  return { passed: failed.length === 0, failed_without: failed };
}

/** Months from the step before the outcome to the outcome, smallest over the supporting cases. */
export function leadTime(
  def: SequenceDefinition,
  support: readonly Support[],
): CandidateStats['lead_time'] {
  const leads = support.flatMap((s) => {
    const outcome = s.matched.at(-1);
    const before = s.matched.at(-2);
    return outcome === undefined || before === undefined ? [] : [{ outcome, before }];
  });
  const passed =
    leads.length > 0 &&
    leads.every((l) => l.outcome.date >= addMonthsToDate(l.before.date, def.min_lead_months));
  const months = leads.map((l) => approxMonthsBetween(l.before.date, l.outcome.date));
  return { passed, min_months: months.length === 0 ? null : Math.min(...months) };
}

/** How long from the first matched step to the outcome in the supporting cases. */
export function gapSpread(support: readonly Support[]): CandidateStats['gap_months'] {
  const gaps = support.flatMap((s) => {
    const first = s.matched[0];
    const outcome = s.matched.at(-1);
    return first === undefined || outcome === undefined
      ? []
      : [approxMonthsBetween(first.date, outcome.date)];
  });
  if (gaps.length === 0) return null;
  return {
    median: round1(percentile(gaps, 50)),
    p25: round1(percentile(gaps, 25)),
    p75: round1(percentile(gaps, 75)),
  };
}
