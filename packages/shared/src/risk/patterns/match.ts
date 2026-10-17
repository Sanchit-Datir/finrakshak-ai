import { addMonthsToDate } from './dates.js';
import { PatternDefinitionSchema, type PatternDefinition, type StepMatcher } from './schema.js';
import type {
  FlaggedNeighbour,
  MatchResult,
  PatternMatcher,
  SubjectTimeline,
  TimelineEvent,
} from './timeline.js';

/**
 * The pattern matcher (docs/plans/PATTERN_CONTRACT.md, section 6). Pure and deterministic: no clock, no
 * I/O, nothing changed. The miner proposes and backtests with it and the scorer scores with it, so a
 * pattern behaves the same everywhere.
 *
 * Strength: 1 only for a full match. For a sequence of m steps it is k/m, where k is the longest run of
 * leading steps that can be matched in order within the gap (the lead time counts only for a full match);
 * for a co-occurrence it is matched/m (one less than m when all match but too few sources). It never
 * falls when events are added. An event dated after `as_of` is ignored, so a replay cannot see ahead.
 */

const stepMatches = (m: StepMatcher, e: TimelineEvent): boolean =>
  m.by === 'case_type'
    ? e.case_type === m.value
    : m.by === 'kind'
      ? e.kind === m.value
      : e.source_id === m.value;

/**
 * An in-order chain with one event per step, each next event within `maxGapMonths` of the one before.
 * With `minLeadMonths` set, the last event must also come at least that many months after the one before
 * it (the earlier steps are earlier still, so checking the nearest one is enough). `events` must be
 * sorted by date then id. Returns the chain that completes soonest, using the latest possible earlier
 * steps, or null.
 */
export function findSequenceChain(
  events: readonly TimelineEvent[],
  steps: readonly StepMatcher[],
  maxGapMonths: number,
  minLeadMonths: number | null,
): TimelineEvent[] | null {
  const last = steps.length - 1;
  if (last < 0 || events.length === 0) return null;
  const within = events.map((e) => addMonthsToDate(e.date, maxGapMonths));
  const lead = events.map((e) =>
    minLeadMonths === null ? e.date : addMonthsToDate(e.date, minLeadMonths),
  );
  const reach: boolean[][] = steps.map(() => events.map(() => false));
  const allowed = (j: number, i: number, p: number): boolean => {
    const e = events[i];
    const prev = events[p];
    if (e === undefined || prev === undefined) return false;
    return (
      e.date <= (within[p] ?? '') &&
      (j !== last || minLeadMonths === null || e.date >= (lead[p] ?? ''))
    );
  };
  steps.forEach((step, j) => {
    events.forEach((e, i) => {
      if (!stepMatches(step, e)) return;
      let ok = j === 0;
      for (let p = 0; p < i && !ok; p++) ok = (reach[j - 1]?.[p] ?? false) && allowed(j, i, p);
      (reach[j] ??= [])[i] = ok;
    });
  });
  const end = (reach[last] ?? []).findIndex(Boolean);
  if (end < 0) return null;
  const chain: TimelineEvent[] = [];
  let i = end;
  for (let j = last; j >= 0; j--) {
    const e = events[i];
    if (e === undefined) return null;
    chain.unshift(e);
    if (j === 0) break;
    let p = i - 1;
    while (p >= 0 && !((reach[j - 1]?.[p] ?? false) && allowed(j, i, p))) p--;
    i = p;
  }
  return chain;
}

const ids = (events: readonly TimelineEvent[]): string[] => events.map((e) => e.event_id);

function matchSequence(
  def: Extract<PatternDefinition, { template: 'sequence' }>,
  events: readonly TimelineEvent[],
): { strength: number; matched: TimelineEvent[] } | null {
  const m = def.steps.length;
  const full = findSequenceChain(events, def.steps, def.max_gap_months, def.min_lead_months);
  if (full !== null) return { strength: 1, matched: full };
  for (let k = m - 1; k >= 1; k--) {
    const part = findSequenceChain(events, def.steps.slice(0, k), def.max_gap_months, null);
    if (part !== null) return { strength: k / m, matched: part };
  }
  return null;
}

/** Best assignment of distinct events (one per matcher) inside a window, by matched count then sources. */
function bestAssignment(
  matchers: readonly StepMatcher[],
  inWindow: readonly TimelineEvent[],
): { picked: TimelineEvent[]; count: number; sources: number } {
  const candidates = matchers.map((m) => inWindow.filter((e) => stepMatches(m, e)).slice(0, 6));
  let best: { picked: TimelineEvent[]; count: number; sources: number } = {
    picked: [],
    count: 0,
    sources: 0,
  };
  const walk = (j: number, picked: TimelineEvent[]): void => {
    if (j === candidates.length) {
      const sources = new Set(picked.map((e) => e.source_id)).size;
      if (picked.length > best.count || (picked.length === best.count && sources > best.sources))
        best = { picked: [...picked], count: picked.length, sources };
      return;
    }
    for (const e of candidates[j] ?? []) if (!picked.includes(e)) walk(j + 1, [...picked, e]);
    walk(j + 1, picked);
  };
  walk(0, []);
  return best;
}

function matchCoOccurrence(
  def: Extract<PatternDefinition, { template: 'co_occurrence' }>,
  events: readonly TimelineEvent[],
): { strength: number; matched: TimelineEvent[] } | null {
  const m = def.matchers.length;
  const isFull = (a: { count: number; sources: number }): boolean =>
    a.count === m && a.sources >= def.min_sources;
  /** Full beats "all matched, too few sources", which beats fewer matched. */
  const scoreOf = (a: { count: number; sources: number }): number =>
    isFull(a) ? m + 1 : a.count === m ? m - 0.5 : a.count;
  let best: { picked: TimelineEvent[]; count: number; sources: number } | null = null;
  let bestScore = 0;
  for (const anchor of events) {
    const end = addMonthsToDate(anchor.date, def.window_months);
    const inWindow = events.filter((e) => e.date >= anchor.date && e.date <= end);
    const found = bestAssignment(def.matchers, inWindow);
    if (found.count > 0 && scoreOf(found) > bestScore) {
      best = found;
      bestScore = scoreOf(found);
    }
  }
  if (best === null) return null;
  return {
    strength: isFull(best) ? 1 : (best.count === m ? m - 1 : best.count) / m,
    matched: best.picked,
  };
}

function matchGraph(
  def: Extract<PatternDefinition, { template: 'graph_proximity' }>,
  neighbours: readonly FlaggedNeighbour[],
): FlaggedNeighbour[] {
  return neighbours
    .filter(
      (n) =>
        !n.is_hub &&
        n.link_status === 'verified' &&
        n.hops <= def.max_hops &&
        n.kinds.includes(def.kind),
    )
    .sort(
      (a, b) =>
        a.hops - b.hops || (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0),
    );
}

/**
 * Matches an already validated definition. The events are used as given, apart from dropping any dated
 * after `as_of`. Prefer `matchPattern` unless the definition came from the schema.
 */
export function matchDefinition(
  patternId: string,
  def: PatternDefinition,
  timeline: SubjectTimeline,
  neighbours: readonly FlaggedNeighbour[],
): MatchResult | null {
  const events = timeline.events.filter((e) => e.date <= timeline.as_of);
  const result = (
    strength: number,
    matched: readonly TimelineEvent[],
    near: readonly FlaggedNeighbour[] = [],
  ): MatchResult => ({
    pattern_id: patternId,
    strength,
    matched_event_ids: ids(matched),
    matched_neighbour_ids: near.map((n) => n.entity_id),
  });
  switch (def.template) {
    case 'sequence': {
      const r = matchSequence(def, events);
      return r === null ? null : result(r.strength, r.matched);
    }
    case 'co_occurrence': {
      const r = matchCoOccurrence(def, events);
      return r === null ? null : result(r.strength, r.matched);
    }
    case 'graph_proximity': {
      const near = matchGraph(def, neighbours);
      return near.length === 0 ? null : result(1, [], near);
    }
    case 'transaction_typology':
      // The scorer maps a fired monitoring rule to this pattern; there is nothing to match in a timeline.
      return null;
  }
}

/**
 * The contract's matcher. A definition that does not pass the schema, or a template this version does not
 * know, gives null rather than an error, so a bad pattern in a library can never stop a scoring run.
 */
export const matchPattern: PatternMatcher = (pattern, timeline, neighbours) => {
  const parsed = PatternDefinitionSchema.safeParse(pattern.definition);
  return parsed.success
    ? matchDefinition(pattern.pattern_id, parsed.data, timeline, neighbours)
    : null;
};
