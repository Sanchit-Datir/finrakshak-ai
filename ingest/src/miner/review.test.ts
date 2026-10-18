import { entryKey, type SeedVerificationFile } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import {
  SHEET_COLUMNS,
  applySheet,
  buildSheet,
  parseSheet,
  summarise,
  uniqueEntries,
} from './review.js';
import type { CaseTimeline, TimelineEntry } from './timelines.js';

const entry = (doc: string, over: Partial<TimelineEntry> = {}): TimelineEntry => ({
  date: '2024-01-02',
  source_id: 'ibbi',
  case_type: 'ibbi_cirp',
  proceeding_status: 'cirp_initiated',
  title: `SYNTH title ${doc}`,
  url: `https://example.invalid/${doc}`,
  document_id: doc,
  matched_alias: 'SYNTH Alias',
  matched_in: 'title',
  ...over,
});
const timeline = (case_id: string, entries: TimelineEntry[]): CaseTimeline => ({
  case_id,
  display_name: `SYNTH ${case_id}`,
  verification_status: 'seed_candidate_unverified',
  sources: ['ibbi'],
  first_public_record: '2024-01-02',
  entries,
});
const T = [
  timeline('alpha', [entry('d1'), entry('d2', { date: '2024-02-01' }), entry('d1')]),
  timeline('beta', [entry('d3')]),
];
function timelineOf(id: string): CaseTimeline {
  const found = T.find((t) => t.case_id === id);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
}
const key = (doc: string, date = '2024-01-02'): string =>
  entryKey({ document_id: doc, case_type: 'ibbi_cirp', date });
const sheetWith = (verdicts: Record<string, string>, extra = ''): string => {
  const rows = parseCsv(buildSheet(T, null));
  const col = SHEET_COLUMNS.indexOf('verdict');
  const out = rows.map((r, i) =>
    i === 0 ? r : r.map((c, j) => (j === col ? (verdicts[r[1] ?? ''] ?? '') : c)),
  );
  return out.map((r) => r.join(',')).join('\n') + extra;
};

describe('buildSheet', () => {
  it('has the header and one row per unique entry, with duplicate links counted once', () => {
    const rows = parseCsv(buildSheet(T, null));
    expect(rows[0]).toEqual([...SHEET_COLUMNS]);
    expect(rows).toHaveLength(1 + 2 + 1);
    expect(uniqueEntries(timelineOf('alpha')).find((u) => u.key === key('d1'))?.linkedTimes).toBe(
      2,
    );
    expect(rows[1]?.[SHEET_COLUMNS.indexOf('linked_times')]).toBe('2');
  });

  it('limits to chosen cases and rejects an unknown id', () => {
    expect(parseCsv(buildSheet(T, null, ['beta']))).toHaveLength(2);
    expect(() => buildSheet(T, null, ['nope'])).toThrow(/Unknown case id: nope/);
  });

  it('makes web text safe for spreadsheets', () => {
    const evil = [
      timeline('alpha', [
        entry('d1', { title: '=HYPERLINK("http://x")', url: '@x', matched_alias: '+1' }),
      ]),
    ];
    const row = parseCsv(buildSheet(evil, null))[1] ?? [];
    expect(row[SHEET_COLUMNS.indexOf('title')]?.startsWith("'=")).toBe(true);
    expect(row[SHEET_COLUMNS.indexOf('url')]).toBe("'@x");
    expect(row[SHEET_COLUMNS.indexOf('matched_alias')]).toBe("'+1");
  });

  it('fills in earlier decisions so a new sheet does not lose work', () => {
    const previous: SeedVerificationFile = {
      version: 1,
      cases: [
        {
          case_id: 'alpha',
          status: 'unverified',
          reviewed_by: 'A',
          reviewed_on: '2026-10-17',
          entries: [{ entry_key: key('d1'), verdict: 'wrong', note: 'other firm' }],
        },
      ],
    };
    const rows = parseCsv(buildSheet(T, previous));
    const first = rows.find((r) => r[1] === key('d1')) ?? [];
    expect(first[SHEET_COLUMNS.indexOf('verdict')]).toBe('wrong');
    expect(first[SHEET_COLUMNS.indexOf('note')]).toBe('other firm');
  });
});

describe('parseSheet', () => {
  it('reads verdicts case-insensitively and treats blank as not reviewed', () => {
    const { rows, errors } = parseSheet(
      sheetWith({ [key('d1')]: 'CORRECT', [key('d2', '2024-02-01')]: ' wrong ' }),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.verdict)).toEqual(['correct', 'wrong', null]);
  });
  it('reports a bad verdict with its line, and a wrong header', () => {
    const bad = parseSheet(sheetWith({ [key('d1')]: 'ok' }));
    expect(bad.errors[0]).toMatch(/Line 2: verdict "ok"/);
    expect(parseSheet('a,b\n1,2').errors[0]).toMatch(/header row must be/);
  });
  it('skips fully blank lines', () => {
    expect(parseSheet(sheetWith({}, '\n\n,,,,,,,,,,,\n')).rows).toHaveLength(3);
  });
});

describe('applySheet', () => {
  const all = {
    [key('d1')]: 'correct',
    [key('d2', '2024-02-01')]: 'correct',
    [key('d3')]: 'correct',
  };

  it('verifies a case only when every entry has a verdict and none is unsure', () => {
    const { file, errors } = applySheet(parseSheet(sheetWith(all)), T, null, 'Owner', '2026-10-17');
    expect(errors).toEqual([]);
    expect(file?.cases.map((c) => [c.case_id, c.status, c.reviewed_by, c.reviewed_on])).toEqual([
      ['alpha', 'verified', 'Owner', '2026-10-17'],
      ['beta', 'verified', 'Owner', '2026-10-17'],
    ]);
    const partial = applySheet(
      parseSheet(sheetWith({ [key('d1')]: 'correct' })),
      T,
      null,
      'Owner',
      '2026-10-17',
    );
    expect(partial.file?.cases.find((c) => c.case_id === 'alpha')?.status).toBe('unverified');
    const unsure = applySheet(
      parseSheet(sheetWith({ ...all, [key('d3')]: 'unsure' })),
      T,
      null,
      'Owner',
      '2026-10-17',
    );
    expect(unsure.file?.cases.find((c) => c.case_id === 'beta')?.status).toBe('unverified');
  });

  it('keeps decisions of cases that are not in the sheet', () => {
    const first = applySheet(parseSheet(sheetWith(all)), T, null, 'Owner', '2026-10-17').file;
    const onlyBeta = parseSheet(buildSheet(T, first, ['beta']).replace(',correct,', ',wrong,'));
    const next = applySheet(onlyBeta, T, first, 'Second', '2026-10-18').file;
    expect(next?.cases.find((c) => c.case_id === 'alpha')).toEqual(
      first?.cases.find((c) => c.case_id === 'alpha'),
    );
    expect(next?.cases.find((c) => c.case_id === 'beta')).toMatchObject({
      status: 'unverified',
      reviewed_by: 'Second',
      reviewed_on: '2026-10-18',
    });
  });

  it('applies nothing when a row names an unknown case or entry, or the reviewer is empty', () => {
    const unknownCase = parseSheet(sheetWith({}).replace('\nbeta,', '\nzeta,'));
    expect(applySheet(unknownCase, T, null, 'Owner', '2026-10-17')).toMatchObject({
      file: null,
      errors: [expect.stringMatching(/Unknown case "zeta"/)],
    });
    const unknownEntry = parseSheet(sheetWith({}).replace(key('d3'), 'doc_x|ibbi_cirp|2024-01-02'));
    expect(applySheet(unknownEntry, T, null, 'Owner', '2026-10-17').errors[0]).toMatch(
      /not in its timeline/,
    );
    expect(applySheet(parseSheet(sheetWith(all)), T, null, '  ', '2026-10-17').errors[0]).toMatch(
      /reviewer name/,
    );
  });

  it('keeps an earlier decision for an entry whose row was removed from the sheet', () => {
    const first = applySheet(parseSheet(sheetWith(all)), T, null, 'Owner', '2026-10-17').file;
    const lines = buildSheet(T, first, ['alpha']).split('\n');
    const kept = lines
      .filter((l) => !l.includes(key('d2', '2024-02-01')))
      .join('\n')
      .replace(',correct,', ',wrong,');
    const next = applySheet(parseSheet(kept), T, first, 'Owner', '2026-10-18').file;
    const alpha = next?.cases.find((c) => c.case_id === 'alpha');
    expect(alpha?.entries.map((e) => e.verdict)).toEqual(['wrong', 'correct']);
  });

  it('is repeatable: the same sheet applied twice gives the same file', () => {
    const run = (): string =>
      JSON.stringify(applySheet(parseSheet(sheetWith(all)), T, null, 'Owner', '2026-10-17').file);
    expect(run()).toBe(run());
  });
});

describe('summarise', () => {
  it('counts verdicts per case from the saved decisions', () => {
    const file = applySheet(
      parseSheet(sheetWith({ [key('d1')]: 'correct', [key('d2', '2024-02-01')]: 'wrong' })),
      T,
      null,
      'O',
      '2026-10-17',
    ).file;
    expect(summarise(T, file)).toEqual([
      {
        case_id: 'alpha',
        entries: 2,
        correct: 1,
        wrong: 1,
        unsure: 0,
        blank: 0,
        status: 'verified',
      },
      {
        case_id: 'beta',
        entries: 1,
        correct: 0,
        wrong: 0,
        unsure: 0,
        blank: 1,
        status: 'unverified',
      },
    ]);
    expect(
      summarise(T, null).every((s) => s.blank === s.entries && s.status === 'unverified'),
    ).toBe(true);
  });
});
