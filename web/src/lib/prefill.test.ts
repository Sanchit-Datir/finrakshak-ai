import { describe, expect, it } from 'vitest';
import { createDemoDb, newApplicationData } from '../demo/seed.js';
import { prefillFromDocuments } from './prefill.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const docsOf = (appId: string) => db.documents.filter((d) => d.applicationId === appId);

describe('prefillFromDocuments', () => {
  it('fills empty fields from confirmed values, normalising dates and 7/12 area', () => {
    const { data, changes } = prefillFromDocuments(newApplicationData(), docsOf('A-1001'));
    expect(data.applicant.fullName).toBe('Ramesh Shankar Jadhav');
    expect(data.applicant.dob).toBe('1979-03-12');
    expect(data.collateral.surveyNumber).toBe('२१४/२');
    expect(data.collateral.landArea).toBe('1.62');
    expect(changes.length).toBeGreaterThan(5);
  });
  it('never uses unreviewed machine output', () => {
    const { data } = prefillFromDocuments(newApplicationData(), docsOf('A-1002').filter((d) => d.sampleId === 'form-pawar'));
    expect(data.applicant.fullName).toBe('');
    expect(data.loan.amountMinor).toBeNull();
  });
  it('does not overwrite values the reviewer already typed', () => {
    const base = newApplicationData();
    base.applicant.fullName = 'Typed Name';
    expect(prefillFromDocuments(base, docsOf('A-1001')).data.applicant.fullName).toBe('Typed Name');
  });
});
