/** The demo scenarios the launcher offers. Files are in e2e/demo/scenarios/. */
export interface DemoScenario {
  readonly id: '1' | '2';
  readonly file: string;
  readonly stage: 'Pre-sanction' | 'Post-disbursement';
  readonly title: string;
  readonly summary: string;
  readonly shows: readonly string[];
  readonly minutes: string;
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: '1',
    file: 'scenario-1-new-loan-trade-credit-chain.demo.ts',
    stage: 'Pre-sanction',
    title: 'New loan: biggest customer is in liquidation',
    summary:
      'Maheep Marketing Pvt Ltd asks for ₹25 lakh of working capital. The public-records check follows the chain of unpaid dues behind its largest customer.',
    shows: [
      'Starts with a 20-second introduction to FinRakshak AI',
      'Command center, My queue, Applications, Borrowers, Documents, Relationship graph',
      'Chain Deep Star → Navmi → Maruti Strips → Yatin Steels, with IBBI links',
      '₹18,00,000 of ₹50,00,000 receivables (36%) at risk: Urgent review',
      'AI investigator, attention score, Gemini analysis and FinRakshak Copilot',
    ],
    minutes: '2',
  },
  {
    id: '2',
    file: 'scenario-2-advantage-overseas-after-disbursement.demo.ts',
    stage: 'Post-disbursement',
    title: 'Advantage Overseas, after disbursement',
    summary:
      'TEST loan L-2023-0601 (₹2 crore, 1 Jun 2023). Nobody types anything: the watch runs after sign-in and finds six records dated after disbursement.',
    shows: [
      'Insolvency (Nov 2023) → liquidation (Dec 2024) → ED search (Aug 2025) → ED attachments',
      'Urgent review on the Command center, the bell, Alerts and the loan',
      'Every alert links to its source; MCA still says “Active”',
      'Public records, Loan book, Alerts, Copilot, Cases, Reports, Settings',
    ],
    minutes: '2',
  },
];
