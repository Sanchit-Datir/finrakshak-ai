import { describe, expect, it } from 'vitest';
import type { SequenceDefinition } from './backtest.js';
import { baselineOf, populationStats } from './lift.js';
import { crowd, rawEvent } from './testing.js';

const def = (gap = 12): SequenceDefinition => ({
  template: 'sequence',
  steps: [
    { by: 'case_type', value: 'ed_search_seizure' },
    { by: 'kind', value: 'insolvency' },
  ],
  max_gap_months: gap,
  min_lead_months: 1,
});
const ed = (id: string, d = '2019-03-01'): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-ed`, d, 'ed_search_seizure');
const cirp = (id: string, d = '2019-06-01'): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-c`, d, 'ibbi_cirp');

/** 30 who go on to CIRP after ED, 10 with ED only, 60 CIRP only, 100 noise, 5 CIRP before ED. */
const population = [
  ...crowd('g1', 30, (i) => [ed(`g1${i}`), cirp(`g1${i}`)]),
  ...crowd('g2', 10, (i) => [ed(`g2${i}`)]),
  ...crowd('g3', 60, (i) => [cirp(`g3${i}`)]),
  ...crowd('g4', 100, (i) => [rawEvent(`g4${i}`, '2019-01-01', 'rbi_monetary_penalty')]),
  ...crowd('g5', 5, (i) => [cirp(`g5${i}`, '2018-01-01'), ed(`g5${i}`, '2018-09-01')]),
];

describe('baselineOf', () => {
  it('counts each entity once, by the kind of its first insolvency or liquidation record', () => {
    expect(baselineOf(population)).toEqual({ total: 205, insolvency: 95, liquidation: 0 });
    const both = crowd('b', 1, () => [
      rawEvent('l', '2019-01-01', 'ibbi_liquidation'),
      cirp('x', '2020-01-01'),
    ]);
    expect(baselineOf(both)).toEqual({ total: 1, insolvency: 0, liquidation: 1 });
    expect(baselineOf([])).toEqual({ total: 0, insolvency: 0, liquidation: 0 });
  });
});

describe('populationStats', () => {
  it('compares those at risk when the earlier step happened with the share that ends at the outcome', () => {
    const r = populationStats(def(), population, baselineOf(population));
    // At risk: the 30 and the 10 (the 5 were already in CIRP before ED). 30/40 = 75%; base 95/205.
    expect(r).toEqual({ n: 40, follow_on: 30, lift: 1.618 });
  });

  it('does not count an entity whose outcome came before, or on the same day as, the earlier step', () => {
    const same = crowd('s', 3, (i) => [ed(`s${i}`, '2019-03-01'), cirp(`s${i}`, '2019-03-01')]);
    expect(populationStats(def(), same, baselineOf(same)).n).toBe(0);
  });

  it('needs the outcome inside the gap and the lead, and to be the entity’s first outcome', () => {
    const slow = crowd('slow', 4, (i) => [ed(`w${i}`, '2019-01-01'), cirp(`w${i}`, '2020-06-01')]);
    expect(populationStats(def(12), slow, baselineOf(slow))).toMatchObject({ n: 4, follow_on: 0 });
    expect(populationStats(def(24), slow, baselineOf(slow))).toMatchObject({ n: 4, follow_on: 4 });
    const quick = crowd('q', 4, (i) => [ed(`q${i}`, '2019-01-01'), cirp(`q${i}`, '2019-01-10')]);
    expect(populationStats(def(), quick, baselineOf(quick))).toMatchObject({ n: 4, follow_on: 0 });
  });

  it('does not count a later insolvency record when a liquidation record came first', () => {
    const mixed = crowd('m', 4, (i) => [
      ed(`m${i}`, '2019-01-01'),
      rawEvent(`m${i}-l`, '2019-02-01', 'ibbi_liquidation'),
      cirp(`m${i}`, '2019-05-01'),
    ]);
    expect(populationStats(def(), mixed, baselineOf(mixed))).toMatchObject({ n: 4, follow_on: 0 });
  });

  it('gives lift 0 rather than dividing by zero when there is nobody, or nobody ends at the outcome', () => {
    expect(populationStats(def(), [], baselineOf([]))).toEqual({ n: 0, follow_on: 0, lift: 0 });
    const noOutcome = crowd('n', 10, (i) => [ed(`n${i}`)]);
    expect(populationStats(def(), noOutcome, baselineOf(noOutcome)).lift).toBe(0);
  });

  it('handles a three-step pattern: the earlier steps must follow each other inside the gap', () => {
    const three: SequenceDefinition = {
      ...def(),
      steps: [
        { by: 'case_type', value: 'ed_search_seizure' },
        { by: 'case_type', value: 'nfra_inspection_report' },
        { by: 'kind', value: 'insolvency' },
      ],
    };
    const pop = [
      ...crowd('t1', 5, (i) => [
        ed(`t1${i}`, '2019-01-01'),
        rawEvent(`t1n${i}`, '2019-03-01', 'nfra_inspection_report'),
        cirp(`t1${i}`, '2019-06-01'),
      ]),
      ...crowd('t2', 5, (i) => [
        ed(`t2${i}`, '2019-01-01'),
        rawEvent(`t2n${i}`, '2019-03-01', 'nfra_inspection_report'),
      ]),
      ...crowd('t3', 10, (i) => [cirp(`t3${i}`)]),
    ];
    expect(populationStats(three, pop, baselineOf(pop))).toMatchObject({ n: 10, follow_on: 5 });
  });
});
