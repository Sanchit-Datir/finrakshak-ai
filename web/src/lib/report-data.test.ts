import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { Range } from './period.js';
import { computeReportData } from './report-data.js';

const now = new Date('2026-10-15T06:00:00Z');
const db = createDemoDb(now);
const all: Range = { start: new Date('2020-01-01T00:00:00Z'), end: now, label: 'All time' };

describe('computeReportData', () => {
  it('counts every branch for `all` and splits them without overlap per branch', () => {
    const total = computeReportData(db, all, 'all');
    const perBranch = db.branches.map((b) => computeReportData(db, all, b.id));
    expect(total.apps.length).toBeGreaterThan(0);
    expect(perBranch.reduce((n, d) => n + d.apps.length, 0)).toBe(total.apps.length);
    expect(perBranch.reduce((n, d) => n + d.loans.length, 0)).toBe(total.loans.length);
    expect(perBranch.reduce((n, d) => n + d.cases.length, 0)).toBe(total.cases.length);
  });

  it('keeps only records inside the period', () => {
    const lastWeek: Range = {
      start: new Date(now.getTime() - 7 * 86_400_000),
      end: now,
      label: 'Last 7 days',
    };
    const d = computeReportData(db, lastWeek, 'all');
    for (const a of d.apps) {
      const at = new Date(a.submittedAt ?? a.createdAt).getTime();
      expect(at).toBeGreaterThanOrEqual(lastWeek.start.getTime());
    }
    expect(d.apps.length).toBeLessThan(computeReportData(db, all, 'all').apps.length);
  });

  it('returns empty figures for an empty period (boundary: empty)', () => {
    const none: Range = { start: now, end: new Date(now.getTime() - 1), label: 'Empty' };
    const d = computeReportData(db, none, 'all');
    expect(d.apps).toEqual([]);
    expect(d.txns).toEqual([]);
    expect(d.findings).toEqual([]);
  });

  it('only runs checks on applications whose checks were run', () => {
    const d = computeReportData(db, all, 'all');
    expect(d.findings.every(({ a }) => a.checksRunAt !== null)).toBe(true);
  });
});
