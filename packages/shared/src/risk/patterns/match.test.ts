import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MatchCasesFileSchema,
  TimelinesFileSchema,
  checkMatcher,
  outcomeOf,
} from './conformance.js';
import { findSequenceChain, matchDefinition, matchPattern } from './match.js';
import { PatternLibrarySchema, type PatternDefinition, type StepMatcher } from './schema.js';
import type { FlaggedNeighbour, SubjectTimeline, TimelineEvent } from './timeline.js';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const library = PatternLibrarySchema.parse(read('library.sample.json'));
const timelines = TimelinesFileSchema.parse(read('timelines.sample.json')).timelines;
const cases = MatchCasesFileSchema.parse(read('match-cases.json')).cases;

describe('the shared agreement test (docs/plans/PATTERN_CONTRACT.md, section 9)', () => {
  it('passes every fixture case with the real matcher', () => {
    expect(checkMatcher(matchPattern, { patterns: library.patterns, timelines, cases })).toEqual(
      [],
    );
  });
});

// ---- builders for the edge cases -------------------------------------------------------------

const ev = (
  id: string,
  date: string,
  case_type: string,
  kind: TimelineEvent['kind'] = null,
  source_id = 'ed',
): TimelineEvent => ({ event_id: id, date, case_type, kind, source_id, evidence_status: 'fact' });
const line = (events: TimelineEvent[], as_of = '2030-01-01'): SubjectTimeline => ({
  subject_id: 'ent_synth_x',
  as_of,
  events: [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.event_id.localeCompare(b.event_id),
  ),
});
const ct = (value: string): StepMatcher => ({ by: 'case_type', value });
const kind = (value: 'insolvency' | 'liquidation' | 'enforcement'): StepMatcher => ({
  by: 'kind',
  value,
});
const src = (value: 'ed' | 'ibbi' | 'nfra' | 'rbi'): StepMatcher => ({ by: 'source', value });
const seq = (
  steps: StepMatcher[],
  max_gap_months = 12,
  min_lead_months = 1,
): PatternDefinition => ({
  template: 'sequence',
  steps,
  max_gap_months,
  min_lead_months,
});
const run = (
  def: PatternDefinition,
  t: SubjectTimeline,
  n: FlaggedNeighbour[] = [],
): ReturnType<typeof matchDefinition> => matchDefinition('pat_0000000000000000', def, t, n);
const A = (id: string, date: string): TimelineEvent =>
  ev(id, date, 'ed_search_seizure', 'enforcement', 'ed');
const B = (id: string, date: string): TimelineEvent =>
  ev(id, date, 'nfra_inspection_report', null, 'nfra');
const O = (id: string, date: string): TimelineEvent =>
  ev(id, date, 'ibbi_cirp', 'insolvency', 'ibbi');
const STEPS3 = [ct('ed_search_seizure'), ct('nfra_inspection_report'), kind('insolvency')];

describe('sequence', () => {
  it('measures the gap from each step to the next, not from the first step', () => {
    const t = line([A('a', '2020-01-01'), B('b', '2020-12-01'), O('o', '2021-11-01')]);
    expect(run(seq(STEPS3, 12), t)?.strength).toBe(1);
    expect(run(seq(STEPS3, 10), t)?.strength).toBeLessThan(1);
  });

  it('includes the day a gap ends on and clamps month ends (31 Jan + 1 month is 29 Feb 2024)', () => {
    const pair = [ct('ed_search_seizure'), kind('insolvency')];
    expect(run(seq(pair, 1, 0), line([A('a', '2024-01-31'), O('o', '2024-02-29')]))?.strength).toBe(
      1,
    );
    expect(run(seq(pair, 1, 0), line([A('a', '2024-01-31'), O('o', '2024-03-01')]))?.strength).toBe(
      0.5,
    );
    expect(run(seq(pair, 12), line([A('a', '2023-01-10'), O('o', '2024-01-10')]))?.strength).toBe(
      1,
    );
    expect(run(seq(pair, 12), line([A('a', '2023-01-10'), O('o', '2024-01-11')]))?.strength).toBe(
      0.5,
    );
  });

  it('applies the lead to the last step only, and exactly at the limit', () => {
    const pair = [ct('ed_search_seizure'), kind('insolvency')];
    expect(
      run(seq(pair, 12, 1), line([A('a', '2023-01-10'), O('o', '2023-02-10')]))?.strength,
    ).toBe(1);
    expect(
      run(seq(pair, 12, 1), line([A('a', '2023-01-10'), O('o', '2023-02-09')]))?.strength,
    ).toBe(0.5);
    expect(
      run(seq(pair, 12, 0), line([A('a', '2023-01-10'), O('o', '2023-01-10')]))?.strength,
    ).toBe(1);
    const t = line([A('a', '2020-01-01'), B('b', '2020-01-05'), O('o', '2020-03-01')]);
    expect(run(seq(STEPS3, 12, 1), t)?.strength).toBe(1);
    expect(run(seq(STEPS3, 12, 2), t)?.strength).toBeCloseTo(2 / 3, 10);
  });

  it('returns strength k/m for the longest run of leading steps, and null without the first step', () => {
    const only = line([A('a', '2020-01-01')]);
    expect(run(seq(STEPS3), only)?.strength).toBeCloseTo(1 / 3, 10);
    const two = line([A('a', '2020-01-01'), B('b', '2020-03-01')]);
    expect(run(seq(STEPS3), two)?.strength).toBeCloseTo(2 / 3, 10);
    expect(run(seq(STEPS3), two)?.matched_event_ids).toEqual(['a', 'b']);
    expect(run(seq(STEPS3), line([B('b', '2020-03-01'), O('o', '2020-05-01')]))).toBeNull();
    expect(run(seq(STEPS3), line([]))).toBeNull();
  });

  it('orders same-day events by id and never uses one event for two steps', () => {
    const same = [ct('x'), ct('x')];
    expect(run(seq(same, 12, 0), line([ev('e1', '2020-01-01', 'x')]))?.strength).toBe(0.5);
    expect(
      run(seq(same, 12, 0), line([ev('e1', '2020-01-01', 'x'), ev('e2', '2020-01-01', 'x')]))
        ?.strength,
    ).toBe(1);
    const sameDay = line([O('a-outcome', '2020-01-01'), A('b-start', '2020-01-01')]);
    expect(run(seq([ct('ed_search_seizure'), kind('insolvency')], 12, 0), sameDay)?.strength).toBe(
      0.5,
    );
  });

  it('reports the chain that completes soonest, using the nearest earlier steps', () => {
    const t = line([
      A('a1', '2019-01-01'),
      A('a2', '2020-06-01'),
      O('o1', '2020-09-01'),
      O('o2', '2021-01-01'),
    ]);
    const r = run(seq([ct('ed_search_seizure'), kind('insolvency')], 24, 1), t);
    expect(r?.matched_event_ids).toEqual(['a2', 'o1']);
  });

  it('matches by kind and by source as well as by case type', () => {
    const t = line([A('a', '2020-01-01'), O('o', '2020-06-01')]);
    expect(run(seq([kind('enforcement'), kind('insolvency')]), t)?.strength).toBe(1);
    expect(run(seq([src('ed'), src('ibbi')]), t)?.strength).toBe(1);
    expect(run(seq([src('nfra'), src('ibbi')]), t)).toBeNull();
  });

  it('handles four steps and a long timeline without trouble', () => {
    const four = [ct('a'), ct('b'), ct('c'), ct('d')];
    const t = line([
      ev('1', '2020-01-01', 'a'),
      ev('2', '2020-02-01', 'b'),
      ev('3', '2020-03-01', 'c'),
      ev('4', '2020-04-01', 'd'),
    ]);
    expect(run(seq(four, 1, 1), t)?.strength).toBe(1);
    const many = line(
      Array.from({ length: 800 }, (_, i) =>
        ev(`e${String(i).padStart(4, '0')}`, '2020-01-01', i % 2 ? 'a' : 'z'),
      ),
    );
    expect(run(seq([ct('a'), ct('b')]), many)?.strength).toBe(0.5);
  });
});

describe('co_occurrence', () => {
  const co = (
    matchers: StepMatcher[],
    min_sources: number,
    window_months: number,
  ): PatternDefinition => ({
    template: 'co_occurrence',
    matchers,
    min_sources,
    window_months,
  });
  const NF = (id: string, date: string): TimelineEvent =>
    ev(id, date, 'nfra_disciplinary_order', null, 'nfra');

  it('needs every matcher inside the window, from enough different sources', () => {
    const def = co([src('nfra'), kind('enforcement')], 2, 24);
    expect(run(def, line([NF('n', '2020-01-01'), A('a', '2021-12-31')]))?.strength).toBe(1);
    expect(run(def, line([NF('n', '2020-01-01'), A('a', '2022-01-02')]))?.strength).toBe(0.5);
    expect(run(def, line([NF('n', '2020-01-01'), A('a', '2022-01-01')]))?.strength).toBe(1);
  });

  it('is partial when only some matchers are found, null when none is', () => {
    const def = co([src('nfra'), kind('enforcement'), kind('insolvency')], 2, 24);
    expect(run(def, line([A('a', '2020-01-01')]))?.strength).toBeCloseTo(1 / 3, 10);
    expect(run(def, line([A('a', '2020-01-01'), O('o', '2020-02-01')]))?.strength).toBeCloseTo(
      2 / 3,
      10,
    );
    expect(run(def, line([ev('x', '2020-01-01', 'other', null, 'rbi')]))).toBeNull();
  });

  it('is below 1 when all matchers are found but from too few sources', () => {
    const def = co([ct('ed_search_seizure'), ct('ed_arrest')], 2, 24);
    const t = line([A('a', '2020-01-01'), ev('b', '2020-02-01', 'ed_arrest', 'enforcement', 'ed')]);
    expect(run(def, t)?.strength).toBe(0.5);
  });

  it('prefers a later window that has enough sources over an earlier one that does not', () => {
    const def = co([kind('enforcement'), kind('enforcement')], 2, 12);
    const t = line([
      ev('e1', '2018-01-01', 'ed_arrest', 'enforcement', 'ed'),
      ev('e2', '2018-02-01', 'ed_conviction', 'enforcement', 'ed'),
      ev('e3', '2022-01-01', 'ed_arrest', 'enforcement', 'ed'),
      ev('e4', '2022-02-01', 'rbi_licence_cancellation', 'enforcement', 'rbi'),
    ]);
    const r = run(def, t);
    expect(r?.strength).toBe(1);
    expect(r?.matched_event_ids.sort()).toEqual(['e3', 'e4']);
  });

  it('never uses one event for two matchers', () => {
    const def = co([kind('enforcement'), src('ed')], 1, 24);
    expect(run(def, line([A('a', '2020-01-01')]))?.strength).toBe(0.5);
    expect(run(def, line([A('a', '2020-01-01'), A('b', '2020-02-01')]))?.strength).toBe(1);
  });
});

describe('graph_proximity', () => {
  const graph: PatternDefinition = {
    template: 'graph_proximity',
    kind: 'liquidation',
    max_hops: 2,
    exclude_hubs: true,
  };
  const n = (id: string, over: Partial<FlaggedNeighbour> = {}): FlaggedNeighbour => ({
    entity_id: id,
    hops: 1,
    link_status: 'verified',
    kinds: ['liquidation'],
    is_hub: false,
    ...over,
  });
  it('counts verified, non-hub neighbours within the hops, nearest first', () => {
    const r = run(graph, line([]), [n('z', { hops: 2 }), n('b'), n('a')]);
    expect(r?.strength).toBe(1);
    expect(r?.matched_neighbour_ids).toEqual(['a', 'b', 'z']);
  });
  it('ignores hubs (B-40), far links, inferred and user-provided links, and other kinds', () => {
    for (const bad of [
      n('h', { is_hub: true }),
      n('f', { hops: 3 }),
      n('i', { link_status: 'inferred' }),
      n('u', { link_status: 'user_provided' }),
      n('k', { kinds: ['enforcement'] }),
    ])
      expect(run(graph, line([]), [bad]), bad.entity_id).toBeNull();
    expect(run(graph, line([]), [])).toBeNull();
  });
});

describe('contract properties', () => {
  const library2 = library.patterns.filter((p) => p.definition.template !== 'transaction_typology');

  it('is pure: the same inputs give the same output and nothing is changed', () => {
    for (const p of library2)
      for (const t of Object.values(timelines)) {
        const before = JSON.stringify([p, t]);
        const a = matchPattern(p, t, []);
        const b = matchPattern(p, t, []);
        expect(a).toEqual(b);
        expect(JSON.stringify([p, t])).toBe(before);
      }
  });

  it('cannot see events after as_of', () => {
    const base = [A('a', '2020-01-01')];
    const withFuture = { ...line(base, '2020-06-01'), events: [...base, O('o', '2020-09-01')] };
    const def = seq([ct('ed_search_seizure'), kind('insolvency')]);
    expect(run(def, withFuture)).toEqual(run(def, line(base, '2020-06-01')));
    expect(run(def, withFuture)?.strength).toBe(0.5);
  });

  it('gives null, not an error, for a definition that is malformed or a template it does not know', () => {
    const p = { pattern_id: 'pat_0000000000000000' };
    const t = line([A('a', '2020-01-01')]);
    const bad: unknown[] = [
      { template: 'sequence', steps: [ct('x')], max_gap_months: 12, min_lead_months: 1 },
      { template: 'sequence', steps: [ct('x'), ct('y')], max_gap_months: 0, min_lead_months: 1 },
      { template: 'sequence', steps: [ct('x'), ct('y')], max_gap_months: 99, min_lead_months: 1 },
      { template: 'from_the_future', whatever: true },
      {},
      null,
    ];
    for (const definition of bad)
      expect(() =>
        matchPattern({ ...p, definition: definition as PatternDefinition }, t, []),
      ).not.toThrow();
    for (const definition of bad)
      expect(matchPattern({ ...p, definition: definition as PatternDefinition }, t, [])).toBeNull();
  });

  it('never matches a transaction typology against a timeline', () => {
    const def: PatternDefinition = { template: 'transaction_typology', rule_id: 'circular' };
    expect(run(def, line([A('a', '2020-01-01'), O('o', '2020-06-01')]))).toBeNull();
  });

  it('keeps strength between 0 and 1, and never lowers it when an event is added', () => {
    const events = [
      A('a', '2020-01-01'),
      B('b', '2020-03-01'),
      O('o', '2020-06-01'),
      ev('z', '2020-07-01', 'noise'),
    ];
    const def = seq(STEPS3, 12, 1);
    const orders = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
    ];
    for (const order of orders) {
      let last = 0;
      for (let k = 1; k <= order.length; k++) {
        const subset = order
          .slice(0, k)
          .flatMap((i) => (events[i] === undefined ? [] : [events[i]]));
        const s = run(def, line(subset))?.strength ?? 0;
        expect(s).toBeGreaterThanOrEqual(last);
        expect(s).toBeLessThanOrEqual(1);
        last = s;
      }
      expect(last).toBe(1);
    }
  });

  it('reports a full match only at strength 1 and a partial one strictly between 0 and 1', () => {
    const t = line([A('a', '2020-01-01')]);
    expect(outcomeOf(run(seq(STEPS3), t))).toBe('partial_match');
    expect(
      outcomeOf(
        run(seq(STEPS3), line([A('a', '2020-01-01'), B('b', '2020-02-01'), O('o', '2020-04-01')])),
      ),
    ).toBe('full_match');
  });
});

describe('findSequenceChain', () => {
  it('returns null for no steps or no events', () => {
    expect(findSequenceChain([], [ct('x')], 12, null)).toBeNull();
    expect(findSequenceChain([ev('1', '2020-01-01', 'x')], [], 12, null)).toBeNull();
  });
  it('does not look at the lead when it is null', () => {
    const events = [A('a', '2020-01-01'), O('o', '2020-01-02')];
    const steps = [ct('ed_search_seizure'), kind('insolvency')];
    expect(findSequenceChain(events, steps, 12, null)?.length).toBe(2);
    expect(findSequenceChain(events, steps, 12, 1)).toBeNull();
  });
});
