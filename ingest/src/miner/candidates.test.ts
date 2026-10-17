import { patternIdOf } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { frequentPrecursors, hasPrecursor, mineCandidates } from './candidates.js';
import { sha256Hex } from './hash.js';
import { DEFAULT_MINER_SETTINGS, type MinerSettings } from './settings.js';
import { crowd, rawEvent, seed } from './testing.js';

const ed = (id: string, d: string): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-ed`, d, 'ed_search_seizure');
const cirp = (id: string, d: string): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-c`, d, 'ibbi_cirp');
const nfra = (id: string, d: string): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-n`, d, 'nfra_inspection_report');

/** Four cases with ED then CIRP exactly six months later; one with nothing before CIRP; one with ED after CIRP. */
const seeds = [
  ...['s1', 's2', 's3', 's4'].map((id) => seed(id, [ed(id, '2020-01-15'), cirp(id, '2020-07-15')])),
  seed('s5', [rawEvent('s5-n', '2020-01-01', 'rbi_monetary_penalty'), cirp('s5', '2020-02-01')]),
  seed('s6', [cirp('s6', '2018-01-01'), ed('s6', '2018-08-01')]),
];

/** 205 entities; see lift.test.ts. At risk after ED: 40, of whom 30 reach CIRP; 95 of 205 end in CIRP. */
const population = [
  ...crowd('g1', 30, (i) => [ed(`g1${i}`, '2019-03-01'), cirp(`g1${i}`, '2019-06-01')]),
  ...crowd('g2', 10, (i) => [ed(`g2${i}`, '2019-03-01')]),
  ...crowd('g3', 60, (i) => [cirp(`g3${i}`, '2019-06-01')]),
  ...crowd('g4', 100, (i) => [rawEvent(`g4${i}`, '2019-01-01', 'rbi_monetary_penalty')]),
  ...crowd('g5', 5, (i) => [cirp(`g5${i}`, '2018-01-01'), ed(`g5${i}`, '2018-09-01')]),
];
function seedNamed(id: string): (typeof seeds)[number] {
  const found = seeds.find((s) => s.case_id === id);
  if (found === undefined) throw new Error(`no seed ${id}`);
  return found;
}
const settings = (over: Partial<MinerSettings> = {}): MinerSettings => ({
  ...DEFAULT_MINER_SETTINGS,
  ...over,
});

describe('mineCandidates: a planted pattern', () => {
  const r = mineCandidates(seeds, population, settings());
  const best = r.candidates[0];

  it('finds ED then CIRP, with the tightest gap that keeps all four cases', () => {
    expect(best?.definition).toMatchObject({
      template: 'sequence',
      max_gap_months: 6,
      min_lead_months: 1,
      steps: [
        { by: 'case_type', value: 'ed_search_seizure' },
        { by: 'kind', value: 'insolvency' },
      ],
    });
    expect(best?.stats.support_case_ids).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('computes the population numbers by hand: 40 at risk, 30 went on, lift 1.618', () => {
    expect(best?.stats.population).toEqual({ n: 40, follow_on: 30, lift: 1.618 });
  });

  it('reports the gap, the lead, and passes leave-one-out with four cases', () => {
    expect(best?.stats.gap_months).toEqual({ median: 6, p25: 6, p75: 6 });
    expect(best?.stats.lead_time).toEqual({ passed: true, min_months: 6 });
    expect(best?.stats.leave_one_out).toEqual({ passed: true, failed_without: [] });
  });

  it('keeps one candidate for the same cases, preferring the more specific step description', () => {
    expect(r.candidates).toHaveLength(1);
    expect(r.dropped.duplicate).toBeGreaterThan(0);
  });

  it('gives a pattern_id that is the hash of its definition, and records the evidence statuses', () => {
    expect(best).toBeDefined();
    if (best !== undefined) expect(best.pattern_id).toBe(patternIdOf(best.definition, sha256Hex));
    expect(best?.evidence_statuses).toEqual(['fact']);
  });

  it('is repeatable', () => {
    expect(mineCandidates(seeds, population, settings())).toEqual(r);
  });

  it('explains who could support a sequence at all', () => {
    expect(r.seed_cases).toBe(6);
    expect(r.seeds_with_outcome).toBe(6);
    expect(r.seeds_with_precursors).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });
});

describe('thresholds are exact', () => {
  it('support: proposed at exactly the minimum, not below', () => {
    expect(mineCandidates(seeds, population, settings({ minSupport: 4 })).candidates).toHaveLength(
      1,
    );
    const r = mineCandidates(seeds, population, settings({ minSupport: 5 }));
    expect(r.candidates).toEqual([]);
  });

  it('lift: kept at exactly the lift, dropped just above it', () => {
    expect(mineCandidates(seeds, population, settings({ minLift: 1.618 })).candidates).toHaveLength(
      1,
    );
    const r = mineCandidates(seeds, population, settings({ minLift: 1.619 }));
    expect(r.candidates).toEqual([]);
    expect(r.dropped.low_lift).toBeGreaterThan(0);
  });

  it('population: kept at exactly 40 entities, dropped at 41', () => {
    expect(
      mineCandidates(seeds, population, settings({ minPopulation: 40 })).candidates,
    ).toHaveLength(1);
    const r = mineCandidates(seeds, population, settings({ minPopulation: 41 }));
    expect(r.candidates).toEqual([]);
    expect(r.dropped.population_too_small).toBeGreaterThan(0);
  });

  it('leave-one-out: two cases are proposed but flagged; they hinge on both', () => {
    const two = [seeds[0], seeds[1]].flatMap((s) => (s === undefined ? [] : [s]));
    const r = mineCandidates(two, population, settings());
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]?.stats.leave_one_out).toEqual({
      passed: false,
      failed_without: ['s1', 's2'],
    });
  });

  it('cap: returns at most maxCandidates', () => {
    expect(mineCandidates(seeds, population, settings({ maxCandidates: 0 })).candidates).toEqual(
      [],
    );
  });
});

describe('what is not a pattern', () => {
  it('one case with eighty matching events is still one case, so nothing is found from it alone (B-60)', () => {
    const mega = seed('mega', [
      ...Array.from({ length: 80 }, (_, i) =>
        rawEvent(`m${String(i).padStart(2, '0')}`, '2020-01-15', 'ed_search_seizure'),
      ),
      cirp('mega', '2020-07-15'),
    ]);
    const r = mineCandidates([mega], population, settings());
    expect(r.candidates).toEqual([]);
    expect(r.considered).toBe(0);
    const withOne = mineCandidates([mega, seeds[0] ?? mega], population, settings());
    expect(withOne.candidates[0]?.stats.support_case_ids).toEqual(['mega', 's1']);
  });

  it('a step that came after the case’s first insolvency record does not count', () => {
    const lateOnly = ['a', 'b', 'c'].map((id) =>
      seed(id, [
        cirp(id, '2018-01-01'),
        ed(id, '2018-06-01'),
        rawEvent(`${id}-l`, '2019-01-01', 'ibbi_liquidation'),
      ]),
    );
    expect(mineCandidates(lateOnly, population, settings()).candidates).toEqual([]);
  });

  it('a step less than the lead before the outcome does not count', () => {
    const tooClose = ['a', 'b', 'c'].map((id) =>
      seed(id, [ed(id, '2020-01-10'), cirp(id, '2020-01-20')]),
    );
    const r = mineCandidates(tooClose, population, settings());
    expect(r.candidates).toEqual([]);
    expect(r.considered).toBe(0);
  });

  it('cases without any outcome cannot support anything', () => {
    const none = ['a', 'b'].map((id) => seed(id, [ed(id, '2020-01-10')]));
    expect(mineCandidates(none, population, settings()).seeds_with_outcome).toBe(0);
  });

  it('an empty population drops every candidate as too small', () => {
    const r = mineCandidates(seeds, [], settings());
    expect(r.candidates).toEqual([]);
    expect(r.dropped.population_too_small).toBeGreaterThan(0);
  });
});

describe('gaps', () => {
  const make = (gaps: readonly [string, string][]): ReturnType<typeof seed>[] =>
    gaps.map(([from, to], i) => seed(`g${i}`, [ed(`g${i}`, from), cirp(`g${i}`, to)]));
  const gapOf = (s: ReturnType<typeof seed>[]): number | undefined =>
    mineCandidates(s, population, settings()).candidates[0]?.definition.max_gap_months;

  it('takes the tightest step on the ladder that keeps every supporting case', () => {
    expect(
      gapOf(
        make([
          ['2020-01-01', '2020-06-01'],
          ['2020-01-01', '2020-06-01'],
        ]),
      ),
    ).toBe(6);
    expect(
      gapOf(
        make([
          ['2020-01-01', '2020-06-01'],
          ['2020-01-01', '2020-12-01'],
        ]),
      ),
    ).toBe(12);
    expect(
      gapOf(
        make([
          ['2020-01-01', '2020-07-01'],
          ['2020-01-01', '2020-07-01'],
        ]),
      ),
    ).toBe(6);
    expect(
      gapOf(
        make([
          ['2020-01-01', '2020-07-02'],
          ['2020-01-01', '2020-07-02'],
        ]),
      ),
    ).toBe(12);
    expect(
      gapOf(
        make([
          ['2020-01-01', '2022-12-01'],
          ['2020-01-01', '2022-12-01'],
        ]),
      ),
    ).toBe(36);
  });
});

describe('three steps', () => {
  it('can return a three-step sequence when it has a clearly better lift than the pairs', () => {
    const triple = ['a', 'b', 'c'].map((id) =>
      seed(id, [ed(id, '2020-01-01'), nfra(id, '2020-03-01'), cirp(id, '2020-06-01')]),
    );
    const pop = [
      ...crowd('t1', 20, (i) => [
        ed(`t1${i}`, '2019-01-01'),
        nfra(`t1${i}`, '2019-03-01'),
        cirp(`t1${i}`, '2019-06-01'),
      ]),
      ...crowd('t2', 30, (i) => [ed(`t2${i}`, '2019-01-01')]),
      ...crowd('t3', 30, (i) => [nfra(`t3${i}`, '2019-01-01')]),
      ...crowd('t4', 60, (i) => [rawEvent(`t4${i}`, '2019-01-01', 'rbi_monetary_penalty')]),
    ];
    const best = mineCandidates(triple, pop, settings()).candidates[0];
    expect(best?.definition.steps).toHaveLength(3);
    expect(best?.stats.population).toMatchObject({ n: 20, follow_on: 20 });
    expect(
      mineCandidates(triple, pop, settings({ maxSteps: 2 })).candidates[0]?.definition.steps,
    ).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('frequentPrecursors keeps only matchers that appear in enough different cases', () => {
    const keys = frequentPrecursors(seeds, settings()).map((m) => `${m.by}:${m.value}`);
    expect(keys).toContain('case_type:ed_search_seizure');
    expect(keys).toContain('kind:enforcement');
    expect(keys).toContain('source:ed');
    expect(keys).not.toContain('case_type:rbi_monetary_penalty');
  });
  it('hasPrecursor needs a non-outcome record at least the lead before the first outcome', () => {
    expect(hasPrecursor(seedNamed('s1'), settings())).toBe(true);
    expect(hasPrecursor(seedNamed('s6'), settings())).toBe(false);
    expect(
      hasPrecursor(seed('x', [ed('x', '2020-01-10'), cirp('x', '2020-01-20')]), settings()),
    ).toBe(false);
  });
});
