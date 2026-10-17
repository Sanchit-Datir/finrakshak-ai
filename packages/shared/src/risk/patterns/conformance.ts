import { z } from 'zod';
import { FlaggedNeighbourSchema, SubjectTimelineSchema, type PatternMatcher } from './timeline.js';
import { PatternIdSchema, type Pattern } from './schema.js';

/**
 * The agreement test (docs/plans/PATTERN_CONTRACT.md, section 9). Both sides load the same fixture
 * files and run them: the miner side against its real `matchPattern`, the scorer side against a fake.
 * A case pins only what the contract promises, not the strength formula of a partial match.
 */

export const MATCH_OUTCOMES = [
  'no_match',
  'not_full_match',
  'partial_match',
  'full_match',
] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const MatchCaseSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    pattern_id: PatternIdSchema,
    /** A key of the fixture file's `timelines`. */
    timeline_id: z.string().min(1),
    neighbours: z.array(FlaggedNeighbourSchema),
    expect: z.object({
      outcome: z.enum(MATCH_OUTCOMES),
      /** For `full_match`: the ids that must be matched, in any order. */
      matched_event_ids: z.array(z.string()).default([]),
      matched_neighbour_ids: z.array(z.string()).default([]),
    }),
  })
  .refine(
    (c) =>
      c.expect.outcome !== 'full_match' ||
      c.expect.matched_event_ids.length + c.expect.matched_neighbour_ids.length > 0,
    'a full_match case lists what must be matched',
  );
export type MatchCase = z.infer<typeof MatchCaseSchema>;

export const TimelinesFileSchema = z.object({
  schema_version: z.literal(1),
  timelines: z.record(z.string(), SubjectTimelineSchema),
});
export const MatchCasesFileSchema = z.object({
  schema_version: z.literal(1),
  cases: z.array(MatchCaseSchema).min(1),
});

/** null or strength 0 is no match; strength 1 is a full match; anything between is partial. */
export function outcomeOf(result: { strength: number } | null): MatchOutcome {
  if (result === null || result.strength === 0) return 'no_match';
  return result.strength === 1 ? 'full_match' : 'partial_match';
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set(a).size === a.length && b.every((x) => a.includes(x));

export interface ConformanceInput {
  readonly patterns: readonly Pattern[];
  readonly timelines: Readonly<Record<string, z.infer<typeof SubjectTimelineSchema>>>;
  readonly cases: readonly MatchCase[];
}

/** Runs every case against a matcher and returns the failures, one readable line each. */
export function checkMatcher(matcher: PatternMatcher, input: ConformanceInput): string[] {
  const failures: string[] = [];
  for (const c of input.cases) {
    const pattern = input.patterns.find((p) => p.pattern_id === c.pattern_id);
    const timeline = input.timelines[c.timeline_id];
    if (pattern === undefined || timeline === undefined) {
      failures.push(`${c.id}: unknown pattern or timeline`);
      continue;
    }
    const result = matcher(pattern, timeline, c.neighbours);
    const outcome = outcomeOf(result);
    const want = c.expect.outcome;
    if (
      result !== null &&
      (result.pattern_id !== pattern.pattern_id || result.strength < 0 || result.strength > 1)
    )
      failures.push(`${c.id}: result has a wrong pattern_id or a strength outside 0..1`);
    else if (want === 'no_match' && outcome !== 'no_match')
      failures.push(`${c.id}: expected no match, got ${outcome}`);
    else if (want === 'not_full_match' && outcome === 'full_match')
      failures.push(`${c.id}: expected less than a full match, got a full match`);
    else if (want === 'partial_match' && outcome !== 'partial_match')
      failures.push(`${c.id}: expected a partial match, got ${outcome}`);
    else if (want === 'full_match') {
      if (outcome !== 'full_match') failures.push(`${c.id}: expected a full match, got ${outcome}`);
      else if (
        result !== null &&
        !(
          sameSet(result.matched_event_ids, c.expect.matched_event_ids) &&
          sameSet(result.matched_neighbour_ids, c.expect.matched_neighbour_ids)
        )
      )
        failures.push(`${c.id}: matched the wrong events or neighbours`);
    }
  }
  return failures;
}
