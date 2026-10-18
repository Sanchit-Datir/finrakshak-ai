import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../../demo/seed.js';
import { applicationDocs } from './run.js';
import { CHECK_NAMES, checkCoverage } from './coverage.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));

describe('checkCoverage', () => {
  it('lists every configured check once', () => {
    const app = db.applications[0];
    if (app === undefined) throw new Error('no application');
    const names = checkCoverage({ app, docs: applicationDocs(app, db), db }).map((c) => c.name);
    expect(names).toEqual([...CHECK_NAMES]);
  });

  it('does not count checks as run when the application has nothing for them to compare', () => {
    const base = db.applications[0];
    if (base === undefined) throw new Error('no application');
    const app = {
      ...base,
      documentIds: [],
      data: {
        ...base.data,
        applicant: { ...base.data.applicant, fullName: '', dob: '' },
        collateral: {
          ...base.data.collateral,
          surveyNumber: '',
          warehouseReceiptNo: '',
        },
        financial: { ...base.data.financial, declaredAnnualIncomeMinor: null },
        business: { ...base.data.business, businessName: '' },
      },
    };
    const byName = new Map(checkCoverage({ app, docs: [], db }).map((c) => [c.name, c.status]));
    for (const name of [
      'Name consistency across documents',
      'Date-of-birth consistency',
      'Survey number reuse',
      'Warehouse receipt reuse',
      'Declared income vs bank credits',
      'Public records: applicant and customers',
    ])
      expect(byName.get(name), name).toBe('no_input');
    expect(byName.get('Required fields present')).toBe('ran');
  });
});
