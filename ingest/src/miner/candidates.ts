import {
  EVIDENCE_STATUSES,
  addMonthsToDate,
  SourceIdSchema,
  patternIdOf,
  type CandidateStats,
  type EvidenceStatus,
  type StepMatcher,
  type SubjectTimeline,
  type TimelineEvent,
} from '@finrakshak-ai/shared';
import {
  gapSpread,
  leadTime,
  leaveOneOut,
  supportOf,
  type SequenceDefinition,
  type Support,
} from './backtest.js';
import { sha256Hex } from './hash.js';
import { baselineOf, populationStats, type Baseline } from './lift.js';
import { isOutcome, type SeedCase } from './seedTimelines.js';
import { DEFAULT_MINER_SETTINGS, type MinerSettings } from './settings.js';

/** A pattern the code found in the seed cases, with the numbers behind it. The model only words it. */
export interface Candidate {
  readonly pattern_id: string;
  readonly definition: SequenceDefinition;
  readonly stats: CandidateStats;
  readonly evidence_statuses: EvidenceStatus[];
  readonly examples: readonly Support[];
}

export const DROP_REASONS = [
  'support_below_minimum',
  'population_too_small',
  'low_lift',
  'duplicate',
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export interface MineResult {
  readonly candidates: Candidate[];
  /** Step lists tried (before the choice of gap). */
  readonly considered: number;
  readonly dropped: Record<DropReason, number>;
  readonly baseline: Baseline;
  readonly seed_cases: number;
  readonly seeds_with_outcome: number;
  /** Seed cases that have a record at least `minLeadMonths` before their first outcome: the only ones that can support a sequence. */
  readonly seeds_with_precursors: string[];
}

const keyOf = (m: StepMatcher): string => `${m.by}:${m.value}`;
const OUTCOMES: readonly StepMatcher[] = [
  { by: 'kind', value: 'insolvency' },
  { by: 'kind', value: 'liquidation' },
];

/** Steps that can come before an outcome, one matcher per way of describing an event (type, kind, source). */
function matchersFor(e: TimelineEvent): StepMatcher[] {
  const out: StepMatcher[] = [{ by: 'case_type', value: e.case_type }];
  if (e.kind === 'enforcement') out.push({ by: 'kind', value: 'enforcement' });
  const source = SourceIdSchema.safeParse(e.source_id);
  if (source.success) out.push({ by: 'source', value: source.data });
  return out;
}

/** True when the case has a non-outcome record at least `minLeadMonths` before its first outcome. */
export function hasPrecursor(
  seed: SeedCase,
  settings: Pick<MinerSettings, 'minLeadMonths'>,
): boolean {
  const outcome = seed.firstOutcome;
  if (outcome === null) return false;
  const latest = addMonthsToDate(outcome.date, -settings.minLeadMonths);
  return seed.timeline.events.some((e) => !isOutcome(e) && e.date <= latest);
}

/** Precursor matchers that appear before the first outcome in at least `minSupport` different cases. */
export function frequentPrecursors(
  seeds: readonly SeedCase[],
  settings: MinerSettings,
): StepMatcher[] {
  const cases = new Map<string, { matcher: StepMatcher; ids: Set<string> }>();
  for (const seed of seeds) {
    const outcome = seed.firstOutcome;
    if (outcome === null) continue;
    const latest = addMonthsToDate(outcome.date, -settings.minLeadMonths);
    for (const e of seed.timeline.events) {
      if (isOutcome(e) || e.date > latest) continue;
      for (const m of matchersFor(e)) {
        const hit = cases.get(keyOf(m)) ?? { matcher: m, ids: new Set<string>() };
        hit.ids.add(seed.case_id);
        cases.set(keyOf(m), hit);
      }
    }
  }
  return [...cases.values()]
    .filter((c) => c.ids.size >= settings.minSupport)
    .map((c) => c.matcher)
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
}

function stepLists(precursors: readonly StepMatcher[], settings: MinerSettings): StepMatcher[][] {
  const lists: StepMatcher[][] = [];
  for (const o of OUTCOMES) {
    for (const p of precursors) lists.push([p, o]);
    if (settings.maxSteps >= 3)
      for (const p1 of precursors)
        for (const p2 of precursors) if (keyOf(p1) !== keyOf(p2)) lists.push([p1, p2, o]);
  }
  return lists;
}

/** The tightest gap on the ladder that keeps every case the widest gap keeps. */
function tightestDefinition(
  steps: StepMatcher[],
  seeds: readonly SeedCase[],
  settings: MinerSettings,
): { def: SequenceDefinition; support: Support[] } | null {
  const make = (gap: number): SequenceDefinition => ({
    template: 'sequence',
    steps,
    max_gap_months: gap,
    min_lead_months: settings.minLeadMonths,
  });
  const widest = settings.gapLadder.at(-1);
  if (widest === undefined) return null;
  const best = supportOf(make(widest), seeds).length;
  if (best < settings.minSupport) return null;
  for (const gap of settings.gapLadder) {
    const support = supportOf(make(gap), seeds);
    if (support.length === best) return { def: make(gap), support };
  }
  return null;
}

const specificity = (d: SequenceDefinition): number =>
  d.steps.reduce((n, s) => n + (s.by === 'case_type' ? 0 : s.by === 'kind' ? 1 : 2), 0);

const liftOf = (c: Candidate): number => c.stats.population?.lift ?? 0;

/** Negative when `a` is the better of two candidates resting on the same cases and outcome. */
function compareQuality(a: Candidate, b: Candidate): number {
  return (
    liftOf(b) - liftOf(a) ||
    a.definition.steps.length - b.definition.steps.length ||
    a.definition.max_gap_months - b.definition.max_gap_months ||
    specificity(a.definition) - specificity(b.definition) ||
    (a.pattern_id < b.pattern_id ? -1 : a.pattern_id > b.pattern_id ? 1 : 0)
  );
}

function statusesOf(support: readonly Support[]): EvidenceStatus[] {
  const seen = new Set<EvidenceStatus>();
  for (const s of support)
    for (const e of s.matched) if (e.evidence_status !== 'unknown') seen.add(e.evidence_status);
  return EVIDENCE_STATUSES.filter((s) => seen.has(s));
}

/**
 * Finds sequences of two or three steps that end at a case's first insolvency or liquidation record and
 * are shared by at least `minSupport` seed cases, compares each with the population, and returns the
 * best by support then lift. Every number comes from code. Co-occurrence and graph templates are not
 * mined yet; they need a different outcome definition for their baseline.
 */
export function mineCandidates(
  seeds: readonly SeedCase[],
  population: readonly SubjectTimeline[],
  settings: MinerSettings = DEFAULT_MINER_SETTINGS,
): MineResult {
  const dropped: Record<DropReason, number> = {
    support_below_minimum: 0,
    population_too_small: 0,
    low_lift: 0,
    duplicate: 0,
  };
  const baseline = baselineOf(population);
  const lists = stepLists(frequentPrecursors(seeds, settings), settings);
  const kept: Candidate[] = [];
  for (const steps of lists) {
    const found = tightestDefinition(steps, seeds, settings);
    if (found === null) {
      dropped.support_below_minimum++;
      continue;
    }
    const stats = populationStats(found.def, population, baseline);
    if (stats.n < settings.minPopulation) {
      dropped.population_too_small++;
      continue;
    }
    if (stats.lift < settings.minLift) {
      dropped.low_lift++;
      continue;
    }
    kept.push({
      pattern_id: patternIdOf(found.def, sha256Hex),
      definition: found.def,
      stats: {
        support_case_ids: found.support.map((s) => s.case_id).sort(),
        population: stats,
        gap_months: gapSpread(found.support),
        leave_one_out: leaveOneOut(found.support, settings.minSupport),
        lead_time: leadTime(found.def, found.support),
      },
      evidence_statuses: statusesOf(found.support),
      examples: found.support,
    });
  }
  const groups = new Map<string, Candidate[]>();
  for (const c of kept) {
    const key = c.stats.support_case_ids.join(',');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const best = [...groups.values()].map((g) =>
    g.reduce((a, b) => (compareQuality(a, b) <= 0 ? a : b)),
  );
  dropped.duplicate = kept.length - best.length;
  best.sort(
    (a, b) =>
      b.stats.support_case_ids.length - a.stats.support_case_ids.length ||
      liftOf(b) - liftOf(a) ||
      (a.pattern_id < b.pattern_id ? -1 : 1),
  );
  return {
    candidates: best.slice(0, settings.maxCandidates),
    considered: lists.length,
    dropped,
    baseline,
    seed_cases: seeds.length,
    seeds_with_outcome: seeds.filter((s) => s.firstOutcome !== null).length,
    seeds_with_precursors: seeds
      .filter((s) => hasPrecursor(s, settings))
      .map((s) => s.case_id)
      .sort(),
  };
}
