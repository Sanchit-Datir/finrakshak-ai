import type { LoanScenario } from '../types.js';

/**
 * Maheep Marketing applies for working capital; its largest customer is in liquidation at the
 * end of a chain of unpaid dues in public IBBI records. Application values are TEST INPUTS; the
 * public-record results are real (data/graph). See README.md in this folder.
 */
export const maheepTradeCreditChain: LoanScenario = {
  id: 'maheep-trade-credit-chain',
  title: 'Customer in liquidation at the end of a chain of unpaid dues',
  input: {
    borrowerType: 'Private limited company',
    product: 'MSME loan',
    signatory: 'TEST Authorised Signatory',
    amountRupees: '2500000',
    tenureMonths: '12',
    business: {
      name: 'Maheep Marketing Private Limited',
      // Not in the Maharashtra MCA master; matched by exact name.
      cin: '',
      // Sample format printed on PAN forms — a test value, not the company's PAN.
      pan: 'ABCDE1234F',
    },
    customers: [
      {
        name: 'Deep Star Alloys and Steels Private Limited',
        cin: 'U27100MH1995PTC090840',
        outstandingRupees: '1800000',
        oldestUnpaid: '2025-11-30',
      },
      {
        name: 'SYNTH Test Buyer Private Limited (fictional)',
        cin: '',
        outstandingRupees: '3200000',
        oldestUnpaid: '2026-08-31',
      },
    ],
    purpose: 'Working capital against trade receivables (TEST SCENARIO)',
    remarks:
      'TEST SCENARIO: application details are made up for testing. Public-record results come from the local public-records dataset.',
  },
  expect: {
    chain: [/Deep Star Alloys/i, /Navmi Steel/i, /Maruti Strips/i, /Yatin Steels/i],
    chainStatus: /Under Liquidation/,
    impact: { affectedRupees: '18,00,000', percent: '36%' },
    finding: { title: /Customer in liquidation/, detail: /Navmi Steel Traders/i },
    priority: 'Urgent review',
  },
};
