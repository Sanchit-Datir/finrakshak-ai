import { expect, test } from '@playwright/test';
import { maheepTradeCreditChain as s } from '../../scenarios/maheep-trade-credit-chain/scenario.js';
import { readDemoConfig } from '../support/config.js';
import { runAnalysis, runInvestigator } from '../support/application-ai.js';
import { createDirector, type Director } from '../support/director.js';
import { askCopilot } from '../support/post-disbursement.js';
import { signIn } from '../support/sign-in.js';

/**
 * Demo video, scenario 1 (pre-sanction): Maheep Marketing applies for working capital against
 * its receivables. Its largest customer sits at the end of a chain of four unpaid debts and is
 * in liquidation (IBBI). Application values are TEST inputs from
 * e2e/scenarios/maheep-trade-credit-chain; the public-record results are real.
 */

const { input } = s;

async function fillBorrowerAndLoan(d: Director): Promise<void> {
  const { page } = d;
  await d.select(page.getByLabel('Borrower type'), input.borrowerType);
  await d.select(page.getByLabel('Loan product'), input.product);
  await d.type(page.getByLabel('Full name (English / transliterated)'), input.signatory);
  await d.type(page.getByLabel('Requested amount (₹)'), input.amountRupees);
  await d.type(page.getByLabel('Tenure (months)'), input.tenureMonths);
  await d.type(page.getByLabel('Business / firm name'), input.business.name);
  await d.type(page.getByLabel('PAN of the business'), input.business.pan);
}

async function fillCustomers(d: Director): Promise<void> {
  const { page } = d;
  const rows = page.getByRole('list', { name: 'Customers' }).getByRole('listitem');
  for (const [i, c] of input.customers.entries()) {
    await d.click(page.getByRole('button', { name: 'Add customer' }));
    const row = rows.nth(i);
    await d.type(row.getByLabel(`Customer ${i + 1} name`), c.name);
    if (c.cin !== '') await d.type(row.getByLabel('CIN (optional)'), c.cin);
    await d.type(row.getByLabel('Outstanding (₹)'), c.outstandingRupees);
    if (c.oldestUnpaid !== '') await d.set(row.getByLabel('Oldest unpaid invoice'), c.oldestUnpaid);
  }
}

async function showChainAndImpact(d: Director): Promise<void> {
  const { page } = d;
  const chain = page.getByRole('list', { name: /Chain of unpaid dues starting at/ }).first();
  await expect(chain).toBeVisible({ timeout: 90_000 });
  await d.dismissToasts();
  await d.say(
    'Deep Star Alloys owes money to Navmi Steel, which owes Maruti Strips, which owes Yatin Steels.',
  );
  await d.point(chain, 3500);
  if (s.expect.chainStatus !== undefined)
    await d.point(chain.getByText(s.expect.chainStatus).first(), 2500);
  await d.say('Each link in the chain cites the public IBBI announcement it comes from.');
  await d.point(chain.getByRole('link', { name: /IBBI announcement/ }).first(), 2500);
  const impact = page.getByRole('region', { name: 'Impact on receivables' });
  if (s.expect.impact !== undefined) {
    await expect.soft(impact).toContainText(s.expect.impact.affectedRupees);
    await expect.soft(impact).toContainText(s.expect.impact.percent);
  }
  await d.say('Receivables of ₹50,00,000: ₹18,00,000 (36%) is owed by a customer in liquidation.');
  await d.point(impact, 4000);
}

async function showPriorityAndFinding(d: Director): Promise<void> {
  const { page } = d;
  await d.click(page.getByRole('button', { name: /^(Run checks|Re-run checks)$/ }));
  const priority = page.getByRole('heading', { name: 'Review priority' }).locator('xpath=../..');
  await expect(priority).toContainText(s.expect.priority, { timeout: 60_000 });
  await d.dismissToasts();
  await d.point(priority, 3000);
  if (s.expect.finding === undefined) return;
  await d.say('Open the finding to see the evidence, harmless explanations and what to verify.');
  await d.click(page.getByRole('button', { name: s.expect.finding.title }).first());
  const drawer = page.getByRole('dialog');
  await expect.soft(drawer).toContainText(s.expect.finding.detail);
  await d.point(drawer, 5000);
  await page.keyboard.press('Escape');
  await d.pause(500);
}

test('Scenario 1 · New loan: customer in liquidation at the end of a chain of unpaid dues', async ({
  page,
}) => {
  const config = readDemoConfig();
  const d = await createDirector(page, config, {
    label: 'Scenario 1',
    scenes: config.DEMO_AI ? 10 : 7,
  });
  await d.goto('/login');
  await d.titleCard(
    {
      kicker: 'Scenario 1 · Pre-sanction',
      title: 'A new loan whose biggest customer is in liquidation',
      subtitle:
        'Maheep Marketing Pvt Ltd asks for ₹25 lakh of working capital against its receivables.',
      points: [
        'The officer fills the application. No documents are needed.',
        'The public-records check follows the chain of unpaid dues behind each customer.',
        'Application values are TEST inputs; the public records are real (IBBI).',
      ],
    },
    6,
  );

  await d.scene('Sign in', 'A branch manager signs in to FinRakshak AI.', () => signIn(d));

  await d.scene(
    'Start a new loan application',
    'New application opens the form directly.',
    async () => {
      await d.click(page.getByRole('link', { name: 'New application' }).first());
      await expect(page.getByRole('heading', { name: 'New loan application' })).toBeVisible();
    },
  );

  await d.scene(
    'Borrower and loan details',
    'A private limited company applies for an MSME loan of ₹25,00,000 for 12 months.',
    () => fillBorrowerAndLoan(d),
  );

  await d.scene(
    'Largest customers (trade receivables)',
    'Deep Star Alloys owes ₹18,00,000; a synthetic test buyer owes ₹32,00,000.',
    () => fillCustomers(d),
  );

  await d.scene(
    'Loan purpose',
    'Declare the purpose, then continue to the risk analysis.',
    async () => {
      await d.type(page.getByLabel('Declared loan purpose'), input.purpose);
      await d.check(page.getByLabel('Applicant has signed the loan-purpose declaration'));
      await d.set(page.getByLabel('Officer remarks'), input.remarks);
      await d.click(page.getByRole('button', { name: /Continue to risk analysis/ }));
    },
  );

  await d.scene(
    'Public-records check',
    'The applicant and its customers are matched against IBBI, MCA, ED, RBI, NFRA, SFIO and SEBI records.',
    async () => {
      await d.click(page.getByRole('button', { name: /^(Run|Re-run) public-records check$/ }));
      await showChainAndImpact(d);
    },
  );

  await d.scene(
    'Run all checks',
    'The configured checks set the review priority: a lead to verify, not a verdict.',
    () => showPriorityAndFinding(d),
  );

  if (config.DEMO_AI) {
    await d.scene(
      'AI investigator (Gemini)',
      'Gemini reads the application, ratios and public-records shortlist through tools and proposes leads.',
      () => runInvestigator(d),
    );
    await d.scene(
      'Attention score and AI analysis',
      'A code-computed attention score, then Gemini’s summary. Nothing is decided by the AI.',
      () => runAnalysis(d),
    );
    await d.scene(
      'Submit, then ask FinRakshak Copilot',
      'Every Copilot statement must cite this application’s data, or it is removed.',
      async () => {
        await d.click(page.getByRole('button', { name: 'Submit for review' }));
        await expect(page).toHaveURL(/\/applications\/A-/);
        await d.dismissToasts();
        await askCopilot(d, 'Why was this flagged?');
      },
    );
  }

  await d.finish({
    kicker: 'Scenario 1 · What we saw',
    title: 'Urgent review before a rupee is lent',
    subtitle: 'Maheep Marketing’s largest customer is at the end of a chain of unpaid dues.',
    points: [
      'Deep Star → Navmi → Maruti Strips → Yatin Steels (under liquidation), each link from IBBI.',
      '₹18,00,000 of ₹50,00,000 receivables (36%) is owed by a customer in liquidation.',
      'Leads to verify with the borrower, never a verdict.',
    ],
  });
});
