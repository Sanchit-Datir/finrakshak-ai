import type { InvestigateApplicationInput } from '@finrakshak-ai/shared';
import type { ToolCall, ToolModel, ToolSession } from '../tool-model.js';

/** A small SYNTH bundle for the investigator's tests (test-only; excluded from the build). */
export const BUNDLE: InvestigateApplicationInput = {
  borrowerType: 'private_limited',
  sections: {
    applicant: [{ path: 'applicant.fullName', label: 'Full name', value: 'SYNTH Asha Patil' }],
    business: [
      { path: 'business.businessName', label: 'Business name', value: 'SYNTH Agro Foods Pvt Ltd' },
      { path: 'business.registrationNo', label: 'CIN', value: 'U01100MH2015PTC123456' },
    ],
    loan: [
      { path: 'loan.amount', label: 'Loan amount', value: '₹25,00,000' },
      { path: 'loan.purpose', label: 'Purpose', value: '' },
    ],
    collateral: [{ path: 'collateral.landArea', label: 'Land area', value: '1.5 acre' }],
    customers: [{ path: 'customers.0.name', label: 'Customer 1 name', value: 'SYNTH Mills Ltd' }],
  },
  ratios: [
    {
      name: 'loan_per_acre',
      label: 'Loan per acre',
      value: '₹16,66,667',
      basis: 'Loan amount ÷ land area in acres',
    },
  ],
  parties: [
    {
      partyId: 'business',
      role: 'business',
      name: 'SYNTH Agro Foods Pvt Ltd',
      cin: 'U01100MH2015PTC123456',
      candidates: [
        {
          candidateId: 'org:1',
          name: 'SYNTH AGRO FOODS PRIVATE LIMITED',
          cin: 'U01100MH2015PTC123456',
          address: null,
          status: 'Under CIRP',
          nameScore: 100,
          cinAgrees: true,
          addressAgrees: null,
          records: [
            { recordId: 'ev:1', kind: 'insolvency', date: '2025-03-01', title: 'CIRP order' },
          ],
        },
      ],
      related: [],
    },
    {
      partyId: 'customer:0',
      role: 'customer',
      name: 'SYNTH Mills Ltd',
      cin: '',
      candidates: [
        {
          candidateId: 'org:2',
          name: 'SYNTH MILLS LIMITED',
          cin: 'L17110MH1990PLC000001',
          address: null,
          status: 'Active',
          nameScore: 92,
          cinAgrees: null,
          addressAgrees: null,
          records: [
            { recordId: 'ev:2', kind: 'enforcement', date: '2024-06-10', title: 'ED attachment' },
          ],
        },
      ],
      related: [
        {
          entityId: 'E-9',
          name: 'SYNTH Holdings',
          relation: 'shares address',
          source: 'workspace',
          concern: 'In open case C-3',
        },
        {
          entityId: 'E-10',
          name: 'SYNTH Trust',
          relation: 'director of',
          source: 'workspace',
          concern: null,
        },
      ],
    },
  ],
  findings: [],
};

export const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: undefined,
  name,
  args,
});

/** A model that plays one scripted reply per turn, then stops. */
export function scripted(turns: readonly (readonly ToolCall[])[]): ToolModel & { seen: number } {
  const model = {
    id: 'test-model',
    seen: 0,
    start: (): ToolSession => {
      let i = 0;
      return {
        step: (): Promise<ToolCall[]> => {
          model.seen++;
          return Promise.resolve([...(turns[i++] ?? [])]);
        },
      };
    },
  };
  return model;
}
