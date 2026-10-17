import { describe, expect, it } from 'vitest';
import { mineCandidates } from './candidates.js';
import { formatCandidates, parseCandidateArgs } from './report.js';
import { DEFAULT_MINER_SETTINGS } from './settings.js';
import { crowd, rawEvent, seed } from './testing.js';

const info = { populationUndated: 3, asOf: '2026-10-15', settings: DEFAULT_MINER_SETTINGS };
const ed = (id: string, d: string): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-ed`, d, 'ed_search_seizure');
const cirp = (id: string, d: string): ReturnType<typeof rawEvent> =>
  rawEvent(`${id}-c`, d, 'ibbi_cirp');
const population = [
  ...crowd('g1', 30, (i) => [ed(`g1${i}`, '2019-03-01'), cirp(`g1${i}`, '2019-06-01')]),
  ...crowd('g2', 10, (i) => [ed(`g2${i}`, '2019-03-01')]),
  ...crowd('g3', 60, (i) => [cirp(`g3${i}`, '2019-06-01')]),
  ...crowd('g4', 100, (i) => [rawEvent(`g4${i}`, '2019-01-01', 'rbi_monetary_penalty')]),
];

describe('parseCandidateArgs', () => {
  it('has the default settings and no json', () => {
    expect(parseCandidateArgs([])).toEqual({ settings: DEFAULT_MINER_SETTINGS, json: false });
  });
  it('reads each option', () => {
    const r = parseCandidateArgs([
      '--min-lift',
      '1.5',
      '--min-support',
      '3',
      '--min-population',
      '50',
      '--json',
    ]);
    expect(r.json).toBe(true);
    expect(r.settings).toMatchObject({ minLift: 1.5, minSupport: 3, minPopulation: 50 });
    expect(r.settings.gapLadder).toEqual(DEFAULT_MINER_SETTINGS.gapLadder);
  });
  it('refuses values outside the allowed range', () => {
    for (const bad of [
      ['--min-lift', '-1'],
      ['--min-lift', 'x'],
      ['--min-support', '1'],
      ['--min-support', '24'],
      ['--min-support', '2.5'],
      ['--min-population', '0'],
    ])
      expect(() => parseCandidateArgs(bad), bad.join(' ')).toThrow(/Bad options/);
  });
});

describe('formatCandidates', () => {
  it('says plainly when there is nothing to build a sequence from', () => {
    const only = [seed('a', [cirp('a', '2020-01-01')]), seed('b', [cirp('b', '2020-01-01')])];
    const text = formatCandidates(mineCandidates(only, population), info);
    expect(text).toContain('Seed cases: 2; with an insolvency or liquidation record: 2.');
    expect(text).toContain('nothing to build a sequence from');
    expect(text).toContain('Nothing is proposed.');
    expect(text).toContain('Population: 200 entities');
  });

  it('shows a candidate’s steps, cases, population numbers and leave-one-out result', () => {
    const two = ['a', 'b'].map((id) => seed(id, [ed(id, '2020-01-15'), cirp(id, '2020-07-15')]));
    const text = formatCandidates(mineCandidates(two, population), info);
    expect(text).toContain('1. case_type:ed_search_seizure  ->  kind:insolvency');
    expect(text).toContain('seed cases (2): a, b');
    expect(text).toContain('40 entities showed the earlier steps; 30 (75%) went on to the outcome');
    expect(text).toContain('lift 1.667');
    expect(text).toContain('fails without a or b');
  });
});
