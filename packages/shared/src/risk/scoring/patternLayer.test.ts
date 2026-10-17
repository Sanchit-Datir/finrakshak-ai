import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HAND_WRITTEN_LIBRARY } from '../patterns/handWritten.js';
import { PatternLibrarySchema, type Pattern } from '../patterns/schema.js';
import type { PatternMatcher, SubjectTimeline } from '../patterns/timeline.js';
import type { MonitoringRuleId } from '../rules/types.js';
import {
  patternLayer,
  patternPoints,
  supportWeight,
  type PatternLayerInput,
} from './patternLayer.js';
import { DEFAULT_SCORING_SETTINGS as S } from './settings.js';

const sample = PatternLibrarySchema.parse(
  JSON.parse(
    readFileSync(new URL('../patterns/fixtures/library.sample.json', import.meta.url), 'utf8'),
  ),
);
const byTemplate = (t: string): Pattern => {
  const p = sample.patterns.find((x) => x.definition.template === t && x.status === 'approved');
  if (p === undefined) throw new Error(`no ${t} in the sample`);
  return p;
};
const SEQ = byTemplate('sequence'); // mined: dhfl, ilfs, reliance_adag_finance
const CO = byTemplate('co_occurrence');
const RETIRED = sample.patterns.find((p) => p.status === 'retired');

const timeline: SubjectTimeline = {
  subject_id: 'B-1',
  as_of: '2024-12-31',
  events: [
    {
      event_id: 'e1',
      date: '2024-02-01',
      case_type: 'ed_search_seizure',
      kind: 'enforcement',
      source_id: 'ed',
      evidence_status: 'allegation',
    },
    {
      event_id: 'e2',
      date: '2024-09-01',
      case_type: 'ibbi_cirp',
      kind: 'insolvency',
      source_id: 'ibbi',
      evidence_status: 'fact',
    },
  ],
};

/** A fake matcher: answers from a table of pattern id to strength (step 7 builds the real one). */
const fake =
  (strengths: Record<string, number>): PatternMatcher =>
  (p) => {
    const s = strengths[p.pattern_id];
    return s === undefined
      ? null
      : {
          pattern_id: p.pattern_id,
          strength: s,
          matched_event_ids: ['e1', 'e2'],
          matched_neighbour_ids: [],
        };
  };

const input = (over: Partial<PatternLayerInput> = {}): PatternLayerInput => ({
  patterns: sample.patterns,
  matcher: fake({}),
  timeline,
  neighbours: [],
  firedRules: new Map(),
  verifiedCaseIds: new Set(),
  ...over,
});

describe('support weight', () => {
  it('is 1.0 with 3 verified supporting cases and 0.6 with 2', () => {
    expect(supportWeight(SEQ, new Set(['dhfl', 'ilfs', 'reliance_adag_finance']), S.pattern)).toBe(
      1,
    );
    expect(supportWeight(SEQ, new Set(['dhfl', 'ilfs', 'other']), S.pattern)).toBe(0.6);
    expect(supportWeight(SEQ, new Set(), S.pattern)).toBe(0.6);
  });

  it('is always 0.6 for a hand-written hypothesis', () => {
    const p = HAND_WRITTEN_LIBRARY.patterns[0];
    expect(p).toBeDefined();
    if (p !== undefined)
      expect(supportWeight(p, new Set(['dhfl', 'ilfs', 'reliance_adag_finance']), S.pattern)).toBe(
        0.6,
      );
  });
});

describe('pattern match layer', () => {
  it('scores 0 and marks no_patterns for an empty library (B-56)', () => {
    const r = patternLayer(input({ patterns: [] }), S);
    expect(r).toMatchObject({ points: 0, noPatterns: true });
    expect(r.findings.map((f) => f.code)).toEqual(['no_patterns']);
  });

  it('treats a library with only retired patterns as empty', () => {
    expect(RETIRED).toBeDefined();
    expect(
      patternLayer(input({ patterns: RETIRED === undefined ? [] : [RETIRED] }), S).noPatterns,
    ).toBe(true);
  });

  it('scores round(30 × strength × support weight)', () => {
    expect(patternPoints(1, 0.6, S.pattern)).toBe(18);
    expect(patternPoints(0.25, 0.6, S.pattern)).toBe(5);
    expect(patternPoints(1, 1, S.pattern)).toBe(30);
    const r = patternLayer(input({ matcher: fake({ [SEQ.pattern_id]: 0.5 }) }), S);
    expect(r.points).toBe(9);
  });

  it('takes the largest single pattern, not the sum, capped at 30', () => {
    const verified = new Set(['dhfl', 'ilfs', 'reliance_adag_finance']);
    const r = patternLayer(
      input({
        matcher: fake({ [SEQ.pattern_id]: 1, [CO.pattern_id]: 1 }),
        verifiedCaseIds: verified,
      }),
      S,
    );
    expect(r.reasons).toHaveLength(2);
    expect(r.points).toBe(30);
    expect(r.reasons.map((x) => x.points).reduce((a, b) => a + b, 0)).toBeGreaterThan(30);
  });

  it('writes one reason per matched pattern with the contract fields', () => {
    const r = patternLayer(input({ matcher: fake({ [SEQ.pattern_id]: 1 }) }), S);
    expect(r.reasons).toEqual([
      expect.objectContaining({
        code: 'pattern_match',
        reason_key: `pattern_match|${SEQ.pattern_id}`,
        points: 18,
        evidence_event_ids: ['e1', 'e2'],
        evidence_statuses: ['allegation', 'fact'],
        pattern: {
          pattern_id: SEQ.pattern_id,
          pattern_name: SEQ.name,
          strength: 1,
          support_weight: 0.6,
        },
      }),
    ]);
  });

  it('matches a transaction typology from a fired monitoring rule, without the matcher', () => {
    const fired = new Map<MonitoringRuleId, string[]>([['rapid_onward', ['t1', 't2']]]);
    const never: PatternMatcher = () => {
      throw new Error('the matcher must not see a typology');
    };
    const typologies = HAND_WRITTEN_LIBRARY.patterns.filter(
      (p) => p.definition.template === 'transaction_typology',
    );
    const r = patternLayer(input({ patterns: typologies, matcher: never, firedRules: fired }), S);
    expect(r.points).toBe(18);
    expect(r.reasons[0]).toMatchObject({
      evidence_event_ids: ['t1', 't2'],
      facts: { rule_id: 'rapid_onward' },
    });
    expect(r.findings).toEqual([]);
  });

  it('skips a malformed or mislabelled match result as a finding, never crashing', () => {
    const wrongId: PatternMatcher = () => ({
      pattern_id: 'pat_0000000000000000',
      strength: 1,
      matched_event_ids: [],
      matched_neighbour_ids: [],
    });
    const tooStrong: PatternMatcher = (p) => ({
      pattern_id: p.pattern_id,
      strength: 2,
      matched_event_ids: [],
      matched_neighbour_ids: [],
    });
    const throws: PatternMatcher = () => {
      throw new Error('boom');
    };
    for (const matcher of [wrongId, tooStrong, throws]) {
      const r = patternLayer(input({ patterns: [SEQ], matcher }), S);
      expect(r.points).toBe(0);
      expect(r.findings.map((f) => f.code)).toEqual(['invalid_match_result']);
    }
  });

  it('ignores a zero-strength match', () => {
    expect(patternLayer(input({ matcher: fake({ [SEQ.pattern_id]: 0 }) }), S).reasons).toEqual([]);
  });
});
