/** The demo scenarios the launcher offers. Files are in e2e/demo/scenarios/. */
export interface DemoScenario {
  readonly id: '1' | '2' | '3';
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
      'Fills the application form (TEST values, no documents)',
      'Chain Deep Star → Navmi → Maruti Strips → Yatin Steels, with IBBI links',
      '₹18,00,000 of ₹50,00,000 receivables (36%) at risk: Urgent review',
      'AI investigator, attention score, Gemini analysis and FinRakshak Copilot',
    ],
    minutes: '4–5',
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
      'FinRakshak Copilot explains the loan',
    ],
    minutes: '4–5',
  },
  {
    id: '3',
    file: 'scenario-3-jai-corp-sudden-enforcement.demo.ts',
    stage: 'Post-disbursement',
    title: 'Jai Corp: a clean, listed borrower faces enforcement',
    summary:
      'TEST loan L-2024-0401 (₹5 crore, 1 Apr 2024). Clean at onboarding; on 6 Oct 2026 ED provisionally attached ₹230 crore of property.',
    shows: [
      'No adverse record at onboarding, so no alert then',
      'One Urgent review alert raised automatically after sign-in',
      'The ED press release behind the alert',
      'FinRakshak Copilot suggests what to verify next',
    ],
    minutes: '3–4',
  },
];
