import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MatchCasesFileSchema,
  TimelinesFileSchema,
  checkMatcher,
  outcomeOf,
  type ConformanceInput,
  type MatchCase,
} from './conformance.js';
import { PatternLibrarySchema } from './schema.js';
import type { MatchResult, PatternMatcher } from './timeline.js';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const library = PatternLibrarySchema.parse(read('library.sample.json'));
const timelines = TimelinesFileSchema.parse(read('timelines.sample.json')).timelines;
const cases = MatchCasesFileSchema.parse(read('match-cases.json')).cases;
const input: ConformanceInput = { patterns: library.patterns, timelines, cases };

/** A matcher that answers each case exactly as the fixture expects (looked up by pattern and timeline). */
const perfect: PatternMatcher = (pattern, timeline, neighbours) => {
  const c = cases.find(
    (x) =>
      x.pattern_id === pattern.pattern_id &&
      timelines[x.timeline_id] === timeline &&
      JSON.stringify(x.neighbours) === JSON.stringify(neighbours),
  );
  if (c === undefined) throw new Error('no fixture case for this call');
  const base = {
    pattern_id: pattern.pattern_id,
    matched_event_ids: c.expect.matched_event_ids,
    matched_neighbour_ids: c.expect.matched_neighbour_ids,
  };
  switch (c.expect.outcome) {
    case 'no_match':
      return null;
    case 'full_match':
      return { ...base, strength: 1 };
    case 'partial_match':
    case 'not_full_match':
      return { ...base, matched_event_ids: [], matched_neighbour_ids: [], strength: 0.5 };
  }
};

describe('the fixture files', () => {
  it('parse, and every case points at a pattern and a timeline that exist', () => {
    for (const c of cases) {
      expect(
        library.patterns.some((p) => p.pattern_id === c.pattern_id),
        c.id,
      ).toBe(true);
      expect(timelines[c.timeline_id], c.id).toBeDefined();
    }
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it('cover every template and the edges the contract names', () => {
    const idsOf = (template: string): Set<string> =>
      new Set(
        library.patterns.filter((p) => p.definition.template === template).map((p) => p.pattern_id),
      );
    for (const template of [
      'sequence',
      'co_occurrence',
      'graph_proximity',
      'transaction_typology',
    ]) {
      const mine = cases.filter((c) => idsOf(template).has(c.pattern_id));
      expect(mine.length, template).toBeGreaterThan(0);
      if (template !== 'transaction_typology')
        expect(
          mine.some((c) => c.expect.outcome === 'full_match'),
          `${template} full`,
        ).toBe(true);
      expect(
        mine.some((c) => c.expect.outcome !== 'full_match'),
        `${template} not full`,
      ).toBe(true);
    }
    const names = new Set(cases.map((c) => c.id));
    for (const edge of [
      'seq-gap-at-limit',
      'seq-gap-over',
      'seq-lead-short',
      'seq-wrong-order',
      'graph-hub',
      'graph-too-far',
      'graph-inferred',
      'typology-never',
    ])
      expect(names.has(edge), edge).toBe(true);
  });

  it('refuse a full_match case that lists nothing to match', () => {
    const bad = {
      schema_version: 1,
      cases: [
        {
          ...cases[0],
          expect: { outcome: 'full_match', matched_event_ids: [], matched_neighbour_ids: [] },
        },
      ],
    };
    expect(MatchCasesFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('outcomeOf', () => {
  it('maps null and strength 0 to no match, 1 to full and the rest to partial', () => {
    expect(outcomeOf(null)).toBe('no_match');
    expect(outcomeOf({ strength: 0 })).toBe('no_match');
    expect(outcomeOf({ strength: 0.4 })).toBe('partial_match');
    expect(outcomeOf({ strength: 0.999 })).toBe('partial_match');
    expect(outcomeOf({ strength: 1 })).toBe('full_match');
  });
});

describe('checkMatcher', () => {
  it('passes a matcher that answers every case as expected', () => {
    expect(checkMatcher(perfect, input)).toEqual([]);
  });

  it('flags a matcher that never matches: every full_match case fails', () => {
    const failures = checkMatcher(() => null, input);
    const full = cases.filter((c) => c.expect.outcome === 'full_match').map((c) => c.id);
    expect(failures.map((f) => f.split(':')[0]).sort()).toEqual([...full].sort());
  });

  it('flags a matcher that always matches fully: no_match and not_full cases fail', () => {
    const always: PatternMatcher = (p) => ({
      pattern_id: p.pattern_id,
      strength: 1,
      matched_event_ids: [],
      matched_neighbour_ids: [],
    });
    const failing = new Set(checkMatcher(always, input).map((f) => f.split(':')[0]));
    for (const c of cases.filter(
      (x) => x.expect.outcome === 'no_match' || x.expect.outcome === 'not_full_match',
    ))
      expect(failing.has(c.id), c.id).toBe(true);
  });

  it('flags wrong matched event ids, and wrong matched neighbour ids, each on its own', () => {
    const only = (id: string): ConformanceInput => ({
      ...input,
      cases: cases.filter((c) => c.id === id),
    });
    const events: PatternMatcher = (p, t, n) => {
      const r = perfect(p, t, n);
      return r === null ? null : { ...r, matched_event_ids: ['evt_other'] };
    };
    const neighbours: PatternMatcher = (p, t, n) => {
      const r = perfect(p, t, n);
      return r === null ? null : { ...r, matched_neighbour_ids: ['ent_other'] };
    };
    expect(checkMatcher(events, only('seq-full'))).toEqual([
      'seq-full: matched the wrong events or neighbours',
    ]);
    expect(checkMatcher(neighbours, only('graph-full'))).toEqual([
      'graph-full: matched the wrong events or neighbours',
    ]);
    expect(checkMatcher(neighbours, only('seq-full'))).toEqual([
      'seq-full: matched the wrong events or neighbours',
    ]);
    expect(checkMatcher(events, only('graph-full'))).toEqual([
      'graph-full: matched the wrong events or neighbours',
    ]);
    expect(checkMatcher(perfect, only('seq-full'))).toEqual([]);
  });

  it('flags a result for a different pattern or a strength outside 0..1', () => {
    const otherPattern: PatternMatcher = (p, t, n) => {
      const r = perfect(p, t, n);
      return r === null ? null : { ...r, pattern_id: 'pat_ffffffffffffffff' };
    };
    const tooStrong: PatternMatcher = (p, t, n) => {
      const r = perfect(p, t, n);
      const out: MatchResult | null = r === null ? null : { ...r, strength: 1.2 };
      return out;
    };
    expect(checkMatcher(otherPattern, input).some((f) => f.includes('wrong pattern_id'))).toBe(
      true,
    );
    expect(checkMatcher(tooStrong, input).some((f) => f.includes('outside 0..1'))).toBe(true);
  });

  it('reports an unknown pattern or timeline instead of throwing', () => {
    const first = cases[0];
    if (first === undefined) throw new Error('no fixture cases');
    const c: MatchCase = { ...first, id: 'x', timeline_id: 'nope' };
    expect(checkMatcher(perfect, { ...input, cases: [c] })).toEqual([
      'x: unknown pattern or timeline',
    ]);
  });
});
