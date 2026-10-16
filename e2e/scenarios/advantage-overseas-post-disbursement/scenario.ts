import type { MonitoringScenario } from '../types.js';

/**
 * TEST loan L-2023-0601 to Advantage Overseas Pvt Ltd, disbursed 1 Jun 2023, is in the demo loan
 * book (loan values made up; borrower real). After sign-in the automatic public-records watch
 * must raise six alerts: insolvency (Nov 2023), liquidation (Dec 2024), an ED search (Aug 2025)
 * and three ED attachments (Nov 2025 – Jun 2026). See README.md.
 */
export const advantageOverseasPostDisbursement: MonitoringScenario = {
  id: 'advantage-overseas-post-disbursement',
  title:
    'Disbursed loan: borrower’s insolvency, liquidation and ED actions raise alerts automatically',
  loanId: 'L-2023-0601',
  borrowerName: 'Advantage Overseas Private Limited',
  expectedAlerts: 6,
  timeline: [
    /Corporate Insolvency Resolution Process/,
    /Liquidation Process/,
    /search operations/,
    /Dubai/,
    /bank fraud done by/,
    /Zurich International Life/,
  ],
  alert: {
    title: /Borrower taken to insolvency \(CIRP\)/,
    detail: /moratorium/,
    priority: 'Urgent review',
  },
};
