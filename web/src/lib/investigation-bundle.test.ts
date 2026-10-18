import {
  INVESTIGATION_LIMITS,
  InvestigateApplicationInputSchema,
  type InvestigateApplicationResult,
} from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { createDemoDb, newApplicationData } from '../demo/seed.js';
import type { Application, ApplicationData } from '../domain/schemas.js';
import {
  buildInvestigationBundle,
  investigationCore,
  investigationInputsKey,
} from './investigation-bundle.js';
import { evidenceIndex } from './investigation-evidence.js';
import { emiMinor, investigationRatios } from './investigation-ratios.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const first = db.applications[0];
if (first === undefined) throw new Error('no demo application');
const base: Application = first;

function withData(patch: (d: ApplicationData) => void): Application {
  const data = structuredClone(newApplicationData());
  patch(data);
  return { ...base, borrowerId: null, borrowerType: 'private_limited', data };
}

const app = withData((d) => {
  d.applicant.fullName = 'SYNTH Asha Patil';
  d.applicant.dob = '1980-01-01';
  d.applicant.mobile = '9876543210';
  d.address.line = 'SYNTH House 4, Lane 2';
  d.address.pincode = '411037';
  d.business.businessName = 'SYNTH Agro Foods Pvt Ltd';
  d.business.pan = 'ABCDE1234F';
  d.loan.amountMinor = 2_500_000_00;
  d.loan.tenureMonths = 60;
  d.financial.declaredAnnualIncomeMinor = 1_200_000_00;
  d.collateral.landArea = '1.5';
  d.collateral.landUnit = 'acre';
  d.collateral.collateralValueMinor = 5_000_000_00;
  d.receivables.customers = [
    { name: 'SYNTH Mills Ltd', cin: '', outstandingMinor: 300_000_00, oldestUnpaidDate: '' },
    { name: 'SYNTH Traders', cin: '', outstandingMinor: 100_000_00, oldestUnpaidDate: '' },
  ];
});

describe('investigationRatios', () => {
  const byName = new Map(investigationRatios(app.data, app.borrowerType).map((r) => [r.name, r]));

  it('computes every ratio in code, with its basis', () => {
    expect(byName.get('loan_to_turnover')?.value).toBe('2.08 times');
    expect(byName.get('loan_to_collateral')?.value).toBe('50.0%');
    expect(byName.get('largest_customer_share')?.value).toBe('75.0%');
    expect(byName.get('receivables_to_loan')?.value).toBe('16.0%');
    expect(byName.get('emi_to_monthly_income')?.basis).toContain('assumed 12% a year');
    expect(byName.get('loan_per_acre')?.value).toMatch(/16,66,667/);
  });

  it('leaves out ratios whose inputs are missing or zero', () => {
    const bare = withData((d) => {
      d.loan.amountMinor = 1_000_00;
    });
    expect(investigationRatios(bare.data, 'individual')).toEqual([]);
  });

  it('computes a standard EMI', () => {
    expect(emiMinor(100_000_00, 12, 12)).toBe(8_885_00);
  });
});

describe('buildInvestigationBundle', () => {
  const bundle = buildInvestigationBundle(app, db, [], null);

  it('matches the shared input schema and its size limit', () => {
    expect(InvestigateApplicationInputSchema.safeParse(bundle).success).toBe(true);
    expect(JSON.stringify(bundle).length).toBeLessThan(INVESTIGATION_LIMITS.maxBundleChars);
  });

  it('masks identifiers and leaves out date of birth, mobile and street address (B-16)', () => {
    const text = JSON.stringify(bundle);
    for (const secret of ['ABCDE1234F', '1980-01-01', '9876543210', 'House 4'])
      expect(text).not.toContain(secret);
    expect(bundle.sections.business.find((f) => f.path === 'business.pan')?.value).toMatch(/^XXXX/);
  });

  it('keeps empty fields so gaps can be asked about', () => {
    expect(bundle.sections.loan.find((f) => f.path === 'loan.purpose')?.value).toBe('');
  });

  it('has a party for the applicant, the business and each named customer', () => {
    expect(bundle.parties.map((p) => p.partyId)).toEqual([
      'applicant',
      'business',
      'customer:0',
      'customer:1',
    ]);
    expect(bundle.parties.every((p) => p.candidates.length === 0)).toBe(true);
  });
});

describe('investigationInputsKey', () => {
  it('is stable for the same data and changes when the data changes', () => {
    expect(investigationInputsKey(app, [])).toBe(investigationInputsKey({ ...app }, []));
    const changed = {
      ...app,
      data: { ...app.data, loan: { ...app.data.loan, purpose: 'Dal mill' } },
    };
    expect(investigationInputsKey(changed, [])).not.toBe(investigationInputsKey(app, []));
  });

  it('is computed from the application only (no public-records data)', () => {
    expect(investigationCore(app, []).parties[0]).not.toHaveProperty('candidates');
  });
});

describe('evidenceIndex', () => {
  it('captures what each citation and question gap pointed at', () => {
    const bundle = buildInvestigationBundle(app, db, [], null);
    const result = {
      findings: [
        {
          id: 'ai:1',
          kind: 'implausible_numbers',
          priority: 'routine',
          statement: 'x',
          partyId: null,
          match: null,
          citations: [{ type: 'ratio', name: 'loan_to_collateral' }],
        },
      ],
      questions: [
        { id: 'q:1', question: 'What is the loan for?', gap: 'loan.purpose', citations: [] },
      ],
    } as unknown as InvestigateApplicationResult;
    const ev = evidenceIndex(bundle, result);
    expect(ev['ratio:loan_to_collateral']?.detail).toMatch(/^50\.0%/);
    expect(ev['field:loan.purpose']).toEqual({ label: 'Purpose', detail: '(not given)' });
  });
});
