import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import type { Application } from '../domain/schemas.js';
import { compareNames, crossChecks, normalizeDate, reviewPriority, runChecks } from './checks.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const app = (id: string): Application => {
  const a = db.applications.find((x) => x.id === id);
  if (a === undefined) throw new Error(`missing ${id}`);
  return a;
};
const rules = (id: string): string[] => runChecks(app(id), db).map((f) => f.ruleId);

describe('compareNames', () => {
  it('treats initials as a variation, not a mismatch', () => {
    expect(compareNames('Ramesh Shankar Jadhav', 'RAMESH S JADHAV')).toBe('variation');
  });
  it('is order-insensitive', () => {
    expect(compareNames('Jadhav Ramesh', 'Ramesh Jadhav')).toBe('match');
  });
  it('flags different people', () => {
    expect(compareNames('Sunita Pawar', 'Ganesh Kale')).toBe('mismatch');
  });
});

describe('normalizeDate', () => {
  it('normalises Marathi digits and DD/MM/YYYY', () => {
    expect(normalizeDate('०५/०८/१९८५')).toBe('1985-08-05');
    expect(normalizeDate('1985-08-05')).toBe('1985-08-05');
    expect(normalizeDate('not a date')).toBeNull();
  });
});

describe('application checks on demo data', () => {
  it('clean application A-1001 is routine review with only a same-borrower overlap', () => {
    expect(reviewPriority(app('A-1001'), db)).toBe('routine');
    expect(rules('A-1001')).toEqual(['duplicate_survey']);
  });
  it('A-1002 surfaces the DOB conflict and incomplete-document findings', () => {
    const r = rules('A-1002');
    expect(r).toEqual(
      expect.arrayContaining([
        'dob_conflict',
        'missing_documents',
        'unreviewed_fields',
        'unclear_fields',
      ]),
    );
    expect(reviewPriority(app('A-1002'), db)).toBe('needs_attention');
  });
  it('A-1003 duplicate warehouse receipt across borrowers is urgent', () => {
    const f = runChecks(app('A-1003'), db).find((x) => x.ruleId === 'duplicate_receipt');
    expect(f?.priority).toBe('urgent');
    expect(f?.evidence.some((e) => e.appId === 'A-1009')).toBe(true);
  });
  it('A-1013 flags income mismatch and relationship to an open case', () => {
    expect(rules('A-1013')).toEqual(
      expect.arrayContaining(['income_mismatch', 'relationship_review']),
    );
  });
  it('does not flag the subject of the case itself for relationship review', () => {
    expect(rules('A-1010')).not.toContain('relationship_review');
  });
  it('cross-checks normalise Marathi survey digits', () => {
    const rows = crossChecks(app('A-1001'), db);
    expect(rows.find((r) => r.label === 'Survey / Gat number')?.verdict).toBe('match');
    expect(rows.find((r) => r.label === 'Land area')?.verdict).toBe('match');
  });
});
