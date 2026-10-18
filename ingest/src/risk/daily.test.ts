import { describe, expect, it } from 'vitest';
import {
  SCORING_SETTINGS_V1 as S,
  matchPattern,
  monthEnd,
  type RiskLatestDoc,
} from '@finrakshak-ai/shared';
import { writeSmallDataset } from '../test/synthScoring.js';
import { alertId, priorFor, scoreDay, ScoringOrderError, type DailyOutput } from './daily.js';
import { fileScoringInputs } from './fileInputs.js';
import { codePatterns, loadLibrary } from './patternSources.js';
import { monthsFrom, replay } from './replay.js';

const dir = writeSmallDataset();
const data = await fileScoringInputs({ dir, seedReviewFile: `${dir}/none.json` }).load();
const library = await loadLibrary(codePatterns());
const MONTHS = monthsFrom('2024-01', 24);

const day = (
  asOf: string,
  previous: ReadonlyMap<string, RiskLatestDoc>,
  runId = `run_${asOf}`,
): DailyOutput =>
  scoreDay({
    data,
    asOf,
    runId,
    now: `${asOf}T00:00:00.000Z`,
    settings: S,
    library,
    matcher: matchPattern,
    previous,
  });

const latestMap = (out: DailyOutput): Map<string, RiskLatestDoc> =>
  new Map(out.latestDocs.map((d) => [d.loan_id, d]));

/** Runs the daily step once per month end, carrying the stored state, as the cloud job would. */
function chain(months: readonly string[]): DailyOutput[] {
  let previous = new Map<string, RiskLatestDoc>();
  return months.map((m) => {
    const out = day(monthEnd(m), previous);
    previous = latestMap(out);
    return out;
  });
}

describe('scoreDay (daily scoring run)', () => {
  const runs = chain(MONTHS);

  it('gives the same scores and alerts as the month-by-month replay', () => {
    const r = replay(data, { months: MONTHS, settings: S, library, matcher: matchPattern });
    const daily = runs.flatMap((o) => o.scoreRows);
    expect(daily.map((x) => [x.loan_id, x.as_of, x.score, x.held_band, x.alert_kind])).toEqual(
      r.rows.map((x) => [x.score.loan_id, x.score.as_of, x.score.score, x.held_band, x.alert.kind]),
    );
    expect(runs.flatMap((o) => o.alertDocs)).toHaveLength(
      r.rows.filter((x) => x.alert.kind !== 'none').length,
    );
  });

  it('marks every row and document synthetic and keeps the branch of the loan (B-54)', () => {
    const last = runs.at(-1);
    expect(new Set(last?.latestDocs.map((d) => `${String(d.synthetic)}|${d.branch_id}`))).toEqual(
      new Set(['true|br-synth']),
    );
    expect(new Set(last?.scoreRows.map((d) => d.synthetic))).toEqual(new Set([true]));
  });

  it('a retry of the same IST day gives the same rows and alert ids, whatever its run id (B-24)', () => {
    const prev = latestMap(runs[10] ?? day('2024-11-30', new Map()));
    const first = day(monthEnd('2024-12'), prev, 'run_a');
    const retry = day(monthEnd('2024-12'), latestMap(first), 'run_b');
    const strip = (o: DailyOutput): unknown => o.scoreRows.map((r) => ({ ...r, run_id: '' }));
    expect(strip(retry)).toEqual(strip(first));
    expect(retry.alertDocs.map((a) => a.alert_id)).toEqual(first.alertDocs.map((a) => a.alert_id));
    expect(retry.latestDocs.map((d) => d.state)).toEqual(first.latestDocs.map((d) => d.state));
  });

  it('carries the previous score and band into the next row', () => {
    const second = runs[13]?.scoreRows[0];
    const first = runs[12]?.scoreRows.find((r) => r.loan_id === second?.loan_id);
    expect(first).toBeDefined();
    expect(second?.previous_score).toBe(first?.score);
    expect(second?.previous_band).toBe(first?.held_band);
    expect(runs.flatMap((o) => o.scoreRows).filter((r) => r.previous_score === null)).toHaveLength(
      data.loans.length,
    );
  });

  it('refuses to score a day earlier than one already stored', () => {
    const later = latestMap(runs[5] ?? day('2024-06-30', new Map()));
    expect(() => day(monthEnd('2024-03'), later)).toThrow(ScoringOrderError);
  });

  it('records the library it used, with a content hash, in the pattern rows', () => {
    const rows = runs[0]?.patternRows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.content_hash)).size).toBe(1);
  });
});

describe('alertId and priorFor', () => {
  it('is the same for the same loan and reason keys in any order, and safe as a document id', () => {
    expect(alertId('L/1', ['b', 'a'])).toBe(alertId('L/1', ['a', 'b']));
    expect(alertId('L/1', ['a'])).not.toBe(alertId('L/1', ['b']));
    expect(alertId('L/1', ['a'])).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('starts a first score from nothing', () => {
    expect(priorFor(undefined, '2024-01-31')).toBeNull();
  });
});
