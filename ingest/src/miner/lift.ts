import { findSequenceChain, matchDefinition, type SubjectTimeline } from '@fund-tracker/shared';
import type { SequenceDefinition } from './backtest.js';
import { firstOutcomeOf } from './seedTimelines.js';

/** How many entities in the population end at each kind of outcome (their first insolvency or liquidation record). */
export interface Baseline {
  readonly total: number;
  readonly insolvency: number;
  readonly liquidation: number;
}

export function baselineOf(population: readonly SubjectTimeline[]): Baseline {
  let insolvency = 0;
  let liquidation = 0;
  for (const t of population) {
    const kind = firstOutcomeOf(t.events)?.kind;
    if (kind === 'insolvency') insolvency++;
    if (kind === 'liquidation') liquidation++;
  }
  return { total: population.length, insolvency, liquidation };
}

export interface PopulationStats {
  readonly n: number;
  readonly follow_on: number;
  readonly lift: number;
}

/**
 * Among entities named in adverse records: of those that showed the earlier steps while still short of an
 * outcome (n), how many went on to the outcome in the pattern's gap and lead (follow_on). Lift compares
 * that rate with the share of all such entities that end at this outcome (B-63). The seed cases are inside
 * the population, so this is a comparison group, not an independent test.
 */
export function populationStats(
  def: SequenceDefinition,
  population: readonly SubjectTimeline[],
  baseline: Baseline,
): PopulationStats {
  const outcome = def.steps.at(-1);
  const kind =
    outcome?.by === 'kind' && (outcome.value === 'insolvency' || outcome.value === 'liquidation')
      ? outcome.value
      : null;
  const prefix = def.steps.slice(0, -1);
  let n = 0;
  let followOn = 0;
  for (const t of population) {
    const chain = findSequenceChain(t.events, prefix, def.max_gap_months, null);
    const end = chain?.at(-1);
    if (end === undefined) continue;
    const first = firstOutcomeOf(t.events);
    if (first !== null && first.date <= end.date) continue;
    n++;
    const full = matchDefinition('pat_0000000000000000', def, t, []);
    if (full?.strength === 1 && first !== null && full.matched_event_ids.at(-1) === first.event_id)
      followOn++;
  }
  const base = kind === null || baseline.total === 0 ? 0 : baseline[kind] / baseline.total;
  const lift = n === 0 || base === 0 ? 0 : followOn / n / base;
  return { n, follow_on: followOn, lift: Math.round(lift * 1000) / 1000 };
}
