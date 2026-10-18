import { entryKey, type SeedVerificationFile } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { firstOutcomeOf, isOutcome, seedCases, weakerStatus } from './seedTimelines.js';
import type { CaseTimeline, TimelineEntry } from './timelines.js';
import { AS_OF, rawEvent, timeline } from './testing.js';

const entry = (
  doc: string,
  date: string | null,
  caseType: string,
  source = 'ed',
): TimelineEntry => ({
  date,
  source_id: source,
  case_type: caseType,
  proceeding_status: 'x',
  title: `SYNTH ${doc}`,
  url: `https://example.invalid/${doc}`,
  document_id: doc,
  matched_alias: 'SYNTH',
  matched_in: 'title',
});
const caseOf = (id: string, entries: TimelineEntry[]): CaseTimeline => ({
  case_id: id,
  display_name: `SYNTH ${id}`,
  verification_status: 'seed_candidate_unverified',
  sources: [],
  first_public_record: null,
  entries,
});
const settings = { earliestRealDate: '1990-01-01' };

describe('weakerStatus (B-36)', () => {
  it('picks the less firmly established status and never upgrades', () => {
    expect(weakerStatus('fact', 'allegation')).toBe('allegation');
    expect(weakerStatus('allegation', 'fact')).toBe('allegation');
    expect(weakerStatus('finding', 'fact')).toBe('fact');
    expect(weakerStatus('inference', 'finding')).toBe('inference');
    expect(weakerStatus('fact', 'fact')).toBe('fact');
  });
});

describe('seedCases', () => {
  const doc = (n: string): string => `doc_${n}`;
  const c = caseOf('alpha', [
    entry(doc('1'), '2020-01-15', 'ed_search_seizure'),
    entry(doc('2'), '2020-07-15', 'ibbi_cirp', 'ibbi'),
    entry(doc('2'), '2020-07-15', 'ibbi_cirp', 'ibbi'),
    entry(doc('3'), null, 'ed_arrest'),
    entry(doc('4'), '1970-01-01', 'ed_arrest'),
    entry(doc('5'), '2021-01-01', 'ibbi_liquidation', 'ibbi'),
  ]);

  it('turns entries into an ordered timeline, counting a document linked twice once and dropping undated or placeholder dates', () => {
    const [s] = seedCases([c], null, new Map(), AS_OF, settings);
    expect(s?.timeline.events.map((e) => e.case_type)).toEqual([
      'ed_search_seizure',
      'ibbi_cirp',
      'ibbi_liquidation',
    ]);
    expect(s?.timeline.events.map((e) => e.kind)).toEqual([
      'enforcement',
      'insolvency',
      'liquidation',
    ]);
  });

  it('finds the first insolvency or liquidation record', () => {
    const [s] = seedCases([c], null, new Map(), AS_OF, settings);
    expect(s?.firstOutcome?.case_type).toBe('ibbi_cirp');
    expect(firstOutcomeOf([])).toBeNull();
    expect(timeline('x', [rawEvent('e', '2020-01-01', 'ed_arrest')]).events.some(isOutcome)).toBe(
      false,
    );
  });

  it('leaves out entries the owner marked wrong, so a wrong link cannot support a pattern', () => {
    const review: SeedVerificationFile = {
      version: 1,
      cases: [
        {
          case_id: 'alpha',
          status: 'unverified',
          reviewed_by: 'A',
          reviewed_on: '2026-10-17',
          entries: [
            {
              entry_key: entryKey({
                document_id: doc('1'),
                case_type: 'ed_search_seizure',
                date: '2020-01-15',
              }),
              verdict: 'wrong',
              note: 'other firm',
            },
          ],
        },
      ],
    };
    const [s] = seedCases([c], review, new Map(), AS_OF, settings);
    expect(s?.timeline.events.map((e) => e.case_type)).toEqual(['ibbi_cirp', 'ibbi_liquidation']);
  });

  it('uses the recorded evidence status of a document and calls an unrecorded one unknown', () => {
    const [s] = seedCases([c], null, new Map([[doc('1'), 'allegation' as const]]), AS_OF, settings);
    expect(s?.timeline.events.map((e) => e.evidence_status)).toEqual([
      'allegation',
      'unknown',
      'unknown',
    ]);
  });

  it('ignores events after as_of and gives a case with no outcome a null first outcome', () => {
    const quiet = caseOf('beta', [entry(doc('9'), '2020-01-01', 'ed_arrest')]);
    const [s] = seedCases([quiet], null, new Map(), AS_OF, settings);
    expect(s?.firstOutcome).toBeNull();
    const [late] = seedCases([c], null, new Map(), '2020-03-01', settings);
    expect(late?.timeline.events.map((e) => e.case_type)).toEqual(['ed_search_seizure']);
  });
});
