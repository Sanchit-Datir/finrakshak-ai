import { describe, expect, it } from 'vitest';
import {
  gapSpread,
  leadTime,
  leaveOneOut,
  supportOf,
  type SequenceDefinition,
} from './backtest.js';
import { rawEvent, seed } from './testing.js';

const def = (gap = 12, lead = 1): SequenceDefinition => ({
  template: 'sequence',
  steps: [
    { by: 'case_type', value: 'ed_search_seizure' },
    { by: 'kind', value: 'insolvency' },
  ],
  max_gap_months: gap,
  min_lead_months: lead,
});
const fit = (id: string, edDate = '2020-01-15', cirpDate = '2020-07-15'): ReturnType<typeof seed> =>
  seed(id, [
    rawEvent(`${id}-a`, edDate, 'ed_search_seizure'),
    rawEvent(`${id}-o`, cirpDate, 'ibbi_cirp'),
  ]);

describe('supportOf', () => {
  it('counts each fitting case once and returns the matched events in order', () => {
    const s = supportOf(def(), [
      fit('a'),
      fit('b'),
      seed('c', [rawEvent('c-o', '2020-01-01', 'ibbi_cirp')]),
    ]);
    expect(s.map((x) => x.case_id)).toEqual(['a', 'b']);
    expect(s[0]?.matched.map((e) => e.event_id)).toEqual(['a-a', 'a-o']);
  });

  it('gives one vote to a case with eighty matching entries (B-60)', () => {
    const many = seed('mega', [
      ...Array.from({ length: 80 }, (_, i) =>
        rawEvent(`m${String(i).padStart(2, '0')}`, '2020-01-15', 'ed_search_seizure'),
      ),
      rawEvent('mega-o', '2020-07-15', 'ibbi_cirp'),
    ]);
    expect(supportOf(def(), [many, fit('b')]).map((x) => x.case_id)).toEqual(['mega', 'b']);
    expect(supportOf(def(), [many])).toHaveLength(1);
  });

  it('only counts steps that come before the case’s FIRST insolvency or liquidation record', () => {
    const late = seed('late', [
      rawEvent('x1', '2018-01-01', 'ibbi_cirp'),
      rawEvent('x2', '2018-06-01', 'ed_search_seizure'),
      rawEvent('x3', '2019-01-01', 'ibbi_liquidation'),
    ]);
    const toLiquidation: SequenceDefinition = {
      ...def(),
      steps: [
        { by: 'case_type', value: 'ed_search_seizure' },
        { by: 'kind', value: 'liquidation' },
      ],
    };
    expect(supportOf(toLiquidation, [late])).toEqual([]);
  });

  it('respects the lead and the gap, and skips a case with no outcome', () => {
    expect(supportOf(def(12, 1), [fit('short', '2020-01-10', '2020-01-20')])).toEqual([]);
    expect(supportOf(def(6, 1), [fit('exact', '2020-01-15', '2020-07-15')])).toHaveLength(1);
    expect(supportOf(def(6, 1), [fit('over', '2020-01-15', '2020-07-16')])).toEqual([]);
    expect(
      supportOf(def(), [seed('none', [rawEvent('n', '2020-01-01', 'ed_search_seizure')])]),
    ).toEqual([]);
  });
});

describe('leaveOneOut', () => {
  const s = (n: number): Parameters<typeof leaveOneOut>[0] =>
    Array.from({ length: n }, (_, i) => ({ case_id: `c${i}`, matched: [] }));
  it('fails both cases at exactly the minimum, by construction, and says which', () => {
    expect(leaveOneOut(s(2), 2)).toEqual({ passed: false, failed_without: ['c0', 'c1'] });
  });
  it('passes when losing any one case still leaves the minimum', () => {
    expect(leaveOneOut(s(3), 2)).toEqual({ passed: true, failed_without: [] });
    expect(leaveOneOut(s(4), 4)).toMatchObject({ passed: false });
  });
});

describe('leadTime and gapSpread', () => {
  const support = supportOf(def(), [
    fit('a', '2020-01-15', '2020-07-15'),
    fit('b', '2020-01-01', '2020-04-01'),
    fit('c', '2020-01-01', '2021-01-01'),
  ]);

  it('reports the shortest lead and passes when every case meets the definition’s minimum', () => {
    expect(leadTime(def(), support)).toEqual({ passed: true, min_months: 3 });
    expect(leadTime(def(), [])).toEqual({ passed: false, min_months: null });
  });

  it('fails the lead when a supporting case is closer than the minimum', () => {
    expect(leadTime(def(12, 6), support).passed).toBe(false);
  });

  it('gives the median and quartiles of first step to outcome, in months', () => {
    expect(gapSpread(support)).toEqual({ median: 6, p25: 4.5, p75: 9 });
    expect(gapSpread([])).toBeNull();
  });
});
