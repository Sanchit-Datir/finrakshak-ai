import type { RiskScoreView } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  bandMovement,
  changedSinceLastRun,
  filterRiskScores,
  hasRiskFilters,
  NO_RISK_FILTERS,
  riskScoresCsv,
  summariseTrend,
} from './risk-score-view.js';

function score(
  loan: string,
  over: { band?: RiskScoreView['held_band']; delta?: number | null; stale?: boolean; borrower?: string } = {},
): RiskScoreView {
  return {
    loan_id: loan,
    branch_id: 'br-synth',
    borrower_id: over.borrower ?? `B-${loan}`,
    run_id: 'r',
    as_of: '2025-12-31',
    latest: {
      score: 10,
      stale_inputs: over.stale ?? false,
      data_built_on: '2025-12-31',
    },
    held_band: over.band ?? 'routine',
    alert_kind: 'none',
    delta: over.delta === undefined ? 0 : over.delta,
    change_text: '',
    updated_at: '2025-12-31T18:30:00.000Z',
    synthetic: true,
  } as unknown as RiskScoreView;
}

describe('bandMovement', () => {
  it('counts up, down, new and unchanged', () => {
    const m = bandMovement([
      score('a', { delta: 5 }),
      score('b', { delta: -2 }),
      score('c', { delta: null }),
      score('d', { delta: 0 }),
      score('e', { delta: 1 }),
    ]);
    expect(m).toEqual({ up: 2, down: 1, fresh: 1, unchanged: 1 });
  });
  it('is all zero for no loans', () => {
    expect(bandMovement([])).toEqual({ up: 0, down: 0, fresh: 0, unchanged: 0 });
  });
});

describe('filterRiskScores', () => {
  const rows = [
    score('L-1', { band: 'urgent', delta: 4 }),
    score('L-2', { band: 'routine', delta: 0, stale: true }),
    score('L-3', { band: 'needs_attention', delta: null, borrower: 'Acme' }),
  ];
  it('returns everything with no filters', () => {
    expect(filterRiskScores(rows, NO_RISK_FILTERS)).toHaveLength(3);
    expect(hasRiskFilters(NO_RISK_FILTERS)).toBe(false);
  });
  it('filters by band', () => {
    expect(filterRiskScores(rows, { ...NO_RISK_FILTERS, band: 'urgent' }).map((s) => s.loan_id)).toEqual(['L-1']);
  });
  it('changed keeps moved and new loans', () => {
    const out = filterRiskScores(rows, { ...NO_RISK_FILTERS, changedOnly: true });
    expect(out.map((s) => s.loan_id)).toEqual(['L-1', 'L-3']);
    expect(changedSinceLastRun(score('x', { delta: 0 }))).toBe(false);
  });
  it('stale keeps only stale public data', () => {
    expect(filterRiskScores(rows, { ...NO_RISK_FILTERS, staleOnly: true }).map((s) => s.loan_id)).toEqual(['L-2']);
  });
  it('searches loan id and borrower, ignoring case and spaces', () => {
    expect(filterRiskScores(rows, { ...NO_RISK_FILTERS, query: ' l-2 ' })).toHaveLength(1);
    expect(filterRiskScores(rows, { ...NO_RISK_FILTERS, query: 'acme' })).toHaveLength(1);
    expect(filterRiskScores(rows, { ...NO_RISK_FILTERS, query: 'zzz' })).toHaveLength(0);
    expect(hasRiskFilters({ ...NO_RISK_FILTERS, query: 'x' })).toBe(true);
  });
  it('combines filters', () => {
    expect(
      filterRiskScores(rows, { band: 'routine', changedOnly: true, staleOnly: false, query: '' }),
    ).toHaveLength(0);
  });
});

describe('riskScoresCsv', () => {
  it('writes a header and one row per loan, with First for new loans', () => {
    const csv = riskScoresCsv([score('L-3', { delta: null, band: 'urgent' })], () => 'No alert');
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toContain('Loan,Borrower,Band');
    expect(lines[1]).toBe('L-3,B-L-3,Urgent review,10,First,No alert,2025-12-31,2025-12-31,No');
  });
  it('neutralises spreadsheet formulas in borrower ids', () => {
    const csv = riskScoresCsv([score('L-1', { borrower: '=CMD()' })], () => 'x');
    expect(csv).toContain("'=CMD()");
  });
});

describe('summariseTrend', () => {
  const pt = (as_of: string, score: number, held_band: 'routine' | 'needs_attention' | 'urgent') => ({
    as_of,
    score,
    held_band,
  });
  it('is null for fewer than two runs', () => {
    expect(summariseTrend([])).toBeNull();
    expect(summariseTrend([pt('2025-01-31', 5, 'routine')])).toBeNull();
  });
  it('reports change, peak and band rises', () => {
    const t = summariseTrend([
      pt('2025-01-31', 0, 'routine'),
      pt('2025-02-28', 20, 'needs_attention'),
      pt('2025-03-31', 49, 'urgent'),
      pt('2025-04-30', 30, 'urgent'),
    ]);
    expect(t?.change).toBe(30);
    expect(t?.peak.as_of).toBe('2025-03-31');
    expect(t?.bandRises).toBe(2);
    expect(t?.points).toBe(4);
  });
  it('shows a fall as a negative change', () => {
    expect(summariseTrend([pt('a', 40, 'urgent'), pt('b', 10, 'routine')])?.change).toBe(-30);
  });
});
