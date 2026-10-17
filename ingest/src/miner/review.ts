import {
  REVIEW_VERDICTS,
  SeedVerificationFileSchema,
  deriveCaseStatus,
  entryKey,
  type ReviewVerdict,
  type SeedCaseReview,
  type SeedEntryReview,
  type SeedVerificationFile,
} from '@fund-tracker/shared';
import { neutraliseFormula, parseCsv, toCsv } from './csv.js';
import type { CaseTimeline, TimelineEntry } from './timelines.js';

/** The columns of the review sheet. The owner fills `verdict` (and optionally `note`). */
export const SHEET_COLUMNS = [
  'case_id',
  'entry_key',
  'date',
  'source',
  'case_type',
  'matched_alias',
  'matched_in',
  'linked_times',
  'title',
  'url',
  'verdict',
  'note',
] as const;

export interface SheetRow {
  readonly case_id: string;
  readonly entry_key: string;
  readonly verdict: ReviewVerdict | null;
  readonly note: string;
}

interface UniqueEntry {
  readonly key: string;
  readonly entry: TimelineEntry;
  readonly linkedTimes: number;
}

/** A case's entries in date order, with the same document linked twice counted once. */
export function uniqueEntries(timeline: CaseTimeline): UniqueEntry[] {
  const byKey = new Map<string, UniqueEntry>();
  for (const entry of timeline.entries) {
    const key = entryKey(entry);
    const seen = byKey.get(key);
    byKey.set(key, { key, entry: seen?.entry ?? entry, linkedTimes: (seen?.linkedTimes ?? 0) + 1 });
  }
  return [...byKey.values()];
}

const previousFor = (
  file: SeedVerificationFile | null,
  caseId: string,
): Map<string, SeedEntryReview> =>
  new Map(
    (file?.cases.find((c) => c.case_id === caseId)?.entries ?? []).map((e) => [e.entry_key, e]),
  );

/**
 * The sheet as CSV text: one row per unique entry, filled in from earlier decisions. `only` limits it to
 * some cases. Text copied from the web is made safe for spreadsheet programs.
 */
export function buildSheet(
  timelines: readonly CaseTimeline[],
  previous: SeedVerificationFile | null,
  only: readonly string[] = [],
): string {
  const chosen = only.length === 0 ? timelines : timelines.filter((t) => only.includes(t.case_id));
  const unknown = only.filter((id) => !timelines.some((t) => t.case_id === id));
  if (unknown.length > 0) throw new Error(`Unknown case id: ${unknown.join(', ')}`);
  const rows: string[][] = [[...SHEET_COLUMNS]];
  for (const t of chosen) {
    const prev = previousFor(previous, t.case_id);
    for (const { key, entry, linkedTimes } of uniqueEntries(t)) {
      const decided = prev.get(key);
      rows.push([
        t.case_id,
        key,
        entry.date ?? '',
        entry.source_id,
        entry.case_type,
        neutraliseFormula(entry.matched_alias),
        entry.matched_in,
        String(linkedTimes),
        neutraliseFormula(entry.title),
        neutraliseFormula(entry.url),
        decided?.verdict ?? '',
        decided?.note ?? '',
      ]);
    }
  }
  return toCsv(rows);
}

export interface ParsedSheet {
  readonly rows: SheetRow[];
  readonly errors: string[];
}

const isVerdict = (v: string): v is ReviewVerdict =>
  (REVIEW_VERDICTS as readonly string[]).includes(v);

/** Reads a filled-in sheet. Problems are collected, with the line number, rather than stopping at the first. */
export function parseSheet(csv: string): ParsedSheet {
  const [header, ...body] = parseCsv(csv);
  const errors: string[] = [];
  if (header === undefined || SHEET_COLUMNS.some((c, i) => header[i] !== c))
    return { rows: [], errors: [`The header row must be: ${SHEET_COLUMNS.join(',')}`] };
  const col = (r: readonly string[], name: (typeof SHEET_COLUMNS)[number]): string =>
    r[SHEET_COLUMNS.indexOf(name)]?.trim() ?? '';
  const rows: SheetRow[] = [];
  body.forEach((r, i) => {
    if (r.every((c) => c.trim() === '')) return;
    const line = i + 2;
    const verdictText = col(r, 'verdict').toLowerCase();
    if (verdictText !== '' && !isVerdict(verdictText))
      errors.push(
        `Line ${line}: verdict "${col(r, 'verdict')}" must be correct, wrong, unsure or empty`,
      );
    if (col(r, 'case_id') === '' || col(r, 'entry_key') === '')
      errors.push(`Line ${line}: case_id and entry_key must not be empty`);
    rows.push({
      case_id: col(r, 'case_id'),
      entry_key: col(r, 'entry_key'),
      verdict: isVerdict(verdictText) ? verdictText : null,
      note: col(r, 'note').slice(0, 300),
    });
  });
  return { rows, errors };
}

export interface CaseSummary {
  readonly case_id: string;
  readonly entries: number;
  readonly correct: number;
  readonly wrong: number;
  readonly unsure: number;
  readonly blank: number;
  readonly status: 'verified' | 'unverified';
}

export function summarise(
  timelines: readonly CaseTimeline[],
  file: SeedVerificationFile | null,
): CaseSummary[] {
  return timelines.map((t) => {
    const keys = uniqueEntries(t).map((u) => u.key);
    const prev = previousFor(file, t.case_id);
    const count = (v: ReviewVerdict | null): number =>
      keys.filter((k) => (prev.get(k)?.verdict ?? null) === v).length;
    return {
      case_id: t.case_id,
      entries: keys.length,
      correct: count('correct'),
      wrong: count('wrong'),
      unsure: count('unsure'),
      blank: count(null),
      status: deriveCaseStatus(keys, [...prev.values()]),
    };
  });
}

export interface ApplyResult {
  readonly file: SeedVerificationFile | null;
  readonly errors: string[];
}

/**
 * Merges a filled sheet into the earlier decisions. Cases that are not in the sheet keep what they had.
 * Nothing is produced when any row names an unknown case or entry. Each case in the sheet gets the
 * reviewer and day and a status worked out from its decisions (never typed by hand).
 */
export function applySheet(
  sheet: ParsedSheet,
  timelines: readonly CaseTimeline[],
  previous: SeedVerificationFile | null,
  reviewer: string,
  today: string,
): ApplyResult {
  const errors = [...sheet.errors];
  if (reviewer.trim() === '') errors.push('A reviewer name is required');
  const byCase = new Map(
    timelines.map((t) => [t.case_id, new Set(uniqueEntries(t).map((u) => u.key))]),
  );
  for (const row of sheet.rows) {
    const keys = byCase.get(row.case_id);
    if (keys === undefined) errors.push(`Unknown case "${row.case_id}"`);
    else if (!keys.has(row.entry_key))
      errors.push(`Case ${row.case_id}: entry "${row.entry_key}" is not in its timeline`);
  }
  if (errors.length > 0) return { file: null, errors };

  const sheetCases = new Set(sheet.rows.map((r) => r.case_id));
  const cases: SeedCaseReview[] = (previous?.cases ?? []).filter((c) => !sheetCases.has(c.case_id));
  for (const caseId of sheetCases) {
    const keys = [...(byCase.get(caseId) ?? [])];
    const prev = previousFor(previous, caseId);
    const fromSheet = new Map(
      sheet.rows.filter((r) => r.case_id === caseId).map((r) => [r.entry_key, r]),
    );
    const entries = keys.map((entry_key): SeedEntryReview => {
      const row = fromSheet.get(entry_key);
      const old = prev.get(entry_key);
      return {
        entry_key,
        verdict: row ? row.verdict : (old?.verdict ?? null),
        note: row ? row.note : (old?.note ?? ''),
      };
    });
    cases.push({
      case_id: caseId,
      status: deriveCaseStatus(keys, entries),
      reviewed_by: reviewer.trim(),
      reviewed_on: today,
      entries,
    });
  }
  cases.sort((a, b) => (a.case_id < b.case_id ? -1 : 1));
  return { file: SeedVerificationFileSchema.parse({ version: 1, cases }), errors: [] };
}
