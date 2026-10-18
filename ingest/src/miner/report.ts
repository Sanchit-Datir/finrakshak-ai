import type { StepMatcher } from '@finrakshak-ai/shared';
import { z } from 'zod';
import type { Candidate, MineResult } from './candidates.js';
import { DEFAULT_MINER_SETTINGS, type MinerSettings } from './settings.js';

const label = (s: StepMatcher): string => `${s.by}:${s.value}`;

const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : `${Math.round((a / b) * 100)}%`);

function formatOne(c: Candidate, rank: number, baselineRate: number): string {
  const d = c.definition;
  const s = c.stats;
  const gap =
    s.gap_months === null
      ? 'n/a'
      : `${s.gap_months.median} months (middle half ${s.gap_months.p25} to ${s.gap_months.p75})`;
  const pop = s.population;
  return [
    `${rank}. ${d.steps.map(label).join('  ->  ')}`,
    `     within ${d.max_gap_months} months between steps, the last at least ${d.min_lead_months} month after the one before`,
    `     seed cases (${s.support_case_ids.length}): ${s.support_case_ids.join(', ')}`,
    `     first step to outcome in those cases: median ${gap}`,
    pop === null
      ? '     population: not computed'
      : `     population: ${pop.n} entities showed the earlier steps; ${pop.follow_on} (${pct(pop.follow_on, pop.n)}) went on to the outcome; ${Math.round(baselineRate * 100)}% of all entities end at this outcome; lift ${pop.lift}`,
    `     leave-one-out: ${s.leave_one_out.passed ? 'passed' : `fails without ${s.leave_one_out.failed_without.join(' or ')}`}; shortest lead ${s.lead_time.min_months ?? 'n/a'} months`,
    `     evidence statuses: ${c.evidence_statuses.join(', ') || 'none recorded'}`,
  ].join('\n');
}

/** A readable report of what the miner found, for the owner (checkpoint 1: do the candidates look useful?). */
export function formatCandidates(
  r: MineResult,
  info: { populationUndated: number; asOf: string; settings: MinerSettings },
): string {
  const b = r.baseline;
  const lines = [
    `Seed cases: ${r.seed_cases}; with an insolvency or liquidation record: ${r.seeds_with_outcome}.`,
    `Of those, with any other record at least ${info.settings.minLeadMonths} month before it: ${r.seeds_with_precursors.length}${r.seeds_with_precursors.length > 0 ? ` (${r.seeds_with_precursors.join(', ')})` : ''}.`,
    `Population: ${b.total} entities named in adverse records (as of ${info.asOf}; ${info.populationUndated} undated links left out).`,
    `Ends at insolvency: ${b.insolvency} (${pct(b.insolvency, b.total)}); at liquidation: ${b.liquidation} (${pct(b.liquidation, b.total)}).`,
    `Step lists tried: ${r.considered}. Dropped: ${r.dropped.support_below_minimum} with fewer than ${info.settings.minSupport} seed cases, ${r.dropped.population_too_small} with fewer than ${info.settings.minPopulation} entities to compare, ${r.dropped.low_lift} with lift under ${info.settings.minLift}, ${r.dropped.duplicate} duplicates of a better candidate.`,
    '',
  ];
  if (r.candidates.length === 0)
    lines.push(
      r.considered === 0
        ? `No record type appears before the first insolvency or liquidation record in ${info.settings.minSupport} or more cases, so there is nothing to build a sequence from. In most cases that record is the earliest one the data holds. Nothing is proposed.`
        : 'No candidate passed. Nothing is proposed.',
    );
  r.candidates.forEach((c, i) => {
    const last = c.definition.steps.at(-1);
    const rate =
      last?.by === 'kind' && last.value === 'insolvency'
        ? b.insolvency
        : last?.by === 'kind' && last.value === 'liquidation'
          ? b.liquidation
          : 0;
    lines.push(formatOne(c, i + 1, b.total === 0 ? 0 : rate / b.total), '');
  });
  return lines.join('\n');
}

const Num = z.number().finite();

export interface CandidateArgs {
  readonly settings: MinerSettings;
  readonly json: boolean;
}

/** Reads `--min-lift`, `--min-support`, `--min-population` and `--json`; a bad value throws a readable error. */
export function parseCandidateArgs(args: readonly string[]): CandidateArgs {
  const value = (name: string): number | undefined => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : Number(args[i + 1]);
  };
  const parsed = z
    .object({
      minLift: Num.min(0).max(10),
      minSupport: Num.int().min(2).max(23),
      minPopulation: Num.int().min(1).max(100_000),
    })
    .safeParse({
      minLift: value('--min-lift') ?? DEFAULT_MINER_SETTINGS.minLift,
      minSupport: value('--min-support') ?? DEFAULT_MINER_SETTINGS.minSupport,
      minPopulation: value('--min-population') ?? DEFAULT_MINER_SETTINGS.minPopulation,
    });
  if (!parsed.success)
    throw new Error(
      `Bad options: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return { settings: { ...DEFAULT_MINER_SETTINGS, ...parsed.data }, json: args.includes('--json') };
}
