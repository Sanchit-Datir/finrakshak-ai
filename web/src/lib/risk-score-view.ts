import { RISK_BAND_LABELS, type RiskBand, type RiskScoreView } from '@fund-tracker/shared';
import { toCsv } from './export.js';

/** Pure helpers for the Risk scores page: movement summary, filters and CSV rows (B-54, B-58). */

export interface BandMovement {
  readonly up: number;
  readonly down: number;
  /** First score of a loan: there is no earlier run to compare with (delta is null). */
  readonly fresh: number;
  readonly unchanged: number;
}

/** How many loans moved up, moved down, are new or did not move since the previous run. */
export function bandMovement(scores: readonly RiskScoreView[]): BandMovement {
  let up = 0;
  let down = 0;
  let fresh = 0;
  let unchanged = 0;
  for (const s of scores) {
    if (s.delta === null) fresh++;
    else if (s.delta > 0) up++;
    else if (s.delta < 0) down++;
    else unchanged++;
  }
  return { up, down, fresh, unchanged };
}

export interface RiskFilters {
  readonly band: RiskBand | 'all';
  readonly changedOnly: boolean;
  readonly staleOnly: boolean;
  readonly query: string;
}

export const NO_RISK_FILTERS: RiskFilters = {
  band: 'all',
  changedOnly: false,
  staleOnly: false,
  query: '',
};

export const hasRiskFilters = (f: RiskFilters): boolean =>
  f.band !== 'all' || f.changedOnly || f.staleOnly || f.query.trim() !== '';

/** "Changed since the last run": the score moved, or the loan has no earlier run (new). */
export const changedSinceLastRun = (s: RiskScoreView): boolean => s.delta !== 0;

export function filterRiskScores(
  scores: readonly RiskScoreView[],
  f: RiskFilters,
): RiskScoreView[] {
  const q = f.query.trim().toLowerCase();
  return scores.filter(
    (s) =>
      (f.band === 'all' || s.held_band === f.band) &&
      (!f.changedOnly || changedSinceLastRun(s)) &&
      (!f.staleOnly || s.latest.stale_inputs) &&
      (q === '' ||
        s.loan_id.toLowerCase().includes(q) ||
        s.borrower_id.toLowerCase().includes(q)),
  );
}

const CSV_HEADER = [
  'Loan',
  'Borrower',
  'Band',
  'Score',
  'Change since last run',
  'Last run',
  'Scored on',
  'Public data built on',
  'Public data stale',
];

/** CSV of the rows as shown; `toCsv` neutralises spreadsheet formulas. Test data only (B-54). */
export function riskScoresCsv(
  scores: readonly RiskScoreView[],
  alertKindLabel: (s: RiskScoreView) => string,
): string {
  return toCsv(
    CSV_HEADER,
    scores.map((s) => [
      s.loan_id,
      s.borrower_id,
      RISK_BAND_LABELS[s.held_band],
      s.latest.score,
      s.delta ?? 'First',
      alertKindLabel(s),
      s.as_of,
      s.latest.data_built_on,
      s.latest.stale_inputs ? 'Yes' : 'No',
    ]),
  );
}
