import { describe, expect, it } from 'vitest';
import {
  SeedVerificationFileSchema,
  deriveCaseStatus,
  entryKey,
  excludedEntryKeys,
  verifiedCaseIds,
  type ReviewVerdict,
  type SeedVerificationFile,
} from './seedVerification.js';

const e = (
  entry_key: string,
  verdict: ReviewVerdict | null,
): { entry_key: string; verdict: ReviewVerdict | null } => ({
  entry_key,
  verdict,
});

describe('entryKey', () => {
  it('joins document, case type and date, with an empty date when there is none', () => {
    expect(entryKey({ document_id: 'doc_1', case_type: 'ibbi_cirp', date: '2024-01-02' })).toBe(
      'doc_1|ibbi_cirp|2024-01-02',
    );
    expect(entryKey({ document_id: 'doc_1', case_type: 'ibbi_cirp', date: null })).toBe(
      'doc_1|ibbi_cirp|',
    );
  });
});

describe('deriveCaseStatus', () => {
  const keys = ['a', 'b', 'c'];

  it('is verified when every entry has a verdict, none is unsure and one is correct', () => {
    expect(deriveCaseStatus(keys, [e('a', 'correct'), e('b', 'correct'), e('c', 'correct')])).toBe(
      'verified',
    );
  });
  it('allows wrong entries, which are left out of the case', () => {
    expect(deriveCaseStatus(keys, [e('a', 'correct'), e('b', 'wrong'), e('c', 'wrong')])).toBe(
      'verified',
    );
  });
  it('is unverified while any entry is blank or unsure', () => {
    expect(deriveCaseStatus(keys, [e('a', 'correct'), e('b', 'correct')])).toBe('unverified');
    expect(deriveCaseStatus(keys, [e('a', 'correct'), e('b', 'correct'), e('c', null)])).toBe(
      'unverified',
    );
    expect(deriveCaseStatus(keys, [e('a', 'correct'), e('b', 'correct'), e('c', 'unsure')])).toBe(
      'unverified',
    );
  });
  it('is unverified when nothing is correct or the timeline is empty', () => {
    expect(deriveCaseStatus(keys, [e('a', 'wrong'), e('b', 'wrong'), e('c', 'wrong')])).toBe(
      'unverified',
    );
    expect(deriveCaseStatus([], [])).toBe('unverified');
  });
  it('ignores decisions about entries that are no longer in the timeline', () => {
    expect(deriveCaseStatus(['a'], [e('a', 'correct'), e('gone', 'unsure')])).toBe('verified');
  });
});

describe('file helpers', () => {
  const file: SeedVerificationFile = SeedVerificationFileSchema.parse({
    version: 1,
    cases: [
      {
        case_id: 'dhfl',
        status: 'verified',
        reviewed_by: 'A',
        reviewed_on: '2026-10-17',
        entries: [
          { entry_key: 'a', verdict: 'correct', note: '' },
          { entry_key: 'b', verdict: 'wrong', note: 'other firm' },
        ],
      },
      {
        case_id: 'ilfs',
        status: 'unverified',
        reviewed_by: 'A',
        reviewed_on: '2026-10-17',
        entries: [{ entry_key: 'c', verdict: null, note: '' }],
      },
    ],
  });

  it('lists verified cases and the entries marked wrong', () => {
    expect([...verifiedCaseIds(file)]).toEqual(['dhfl']);
    expect(excludedEntryKeys(file).get('dhfl')).toEqual(new Set(['b']));
    expect(excludedEntryKeys(file).get('ilfs')).toEqual(new Set());
  });

  it('rejects an unknown verdict, a bad case id, a long note and a wrong version', () => {
    const bad = (cases: unknown, version = 1): boolean =>
      !SeedVerificationFileSchema.safeParse({ version, cases }).success;
    const base = {
      case_id: 'dhfl',
      status: 'verified',
      reviewed_by: 'A',
      reviewed_on: '2026-10-17',
    };
    expect(bad([{ ...base, entries: [{ entry_key: 'a', verdict: 'maybe', note: '' }] }])).toBe(
      true,
    );
    expect(bad([{ ...base, case_id: 'DHFL!', entries: [] }])).toBe(true);
    expect(
      bad([{ ...base, entries: [{ entry_key: 'a', verdict: 'correct', note: 'x'.repeat(301) }] }]),
    ).toBe(true);
    expect(bad([{ ...base, entries: [] }], 2)).toBe(true);
  });
});
