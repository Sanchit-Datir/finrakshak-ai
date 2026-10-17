import type { MonitoringScenario } from '../types.js';

/**
 * TEST loan L-2024-0401 to Jai Corp Limited (listed), disbursed 1 Apr 2024, is in the demo loan
 * book (loan values made up; borrower real). The borrower had no insolvency or enforcement record
 * at disbursement; on 6 Oct 2026 ED provisionally attached ₹230 crore of property "against Jai
 * Corp Limited and others". The automatic watch must raise exactly that one alert. See README.md.
 */
export const jaiCorpSuddenEnforcement: MonitoringScenario = {
  id: 'jai-corp-sudden-enforcement',
  title: 'Disbursed loan: a clean, listed borrower suddenly faces an ED attachment',
  loanId: 'L-2024-0401',
  borrowerName: 'Jai Corp Limited',
  expectedAlerts: 1,
  timeline: [/provisionally attached immovable properties worth ₹ 230 Crore/],
  alert: {
    title: /Enforcement action against the borrower: Jai Corp Limited/,
    detail: /Assets, including any security, may be attached/,
    priority: 'Urgent review',
  },
};
