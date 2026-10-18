import { expect, test } from '@playwright/test';
import { maheepTradeCreditChain as s } from '../../scenarios/maheep-trade-credit-chain/scenario.js';
import { runAiReview } from '../support/application-ai.js';
import { readDemoConfig } from '../support/config.js';
import { createDirector, type Director } from '../support/director.js';
import { askCopilot } from '../support/post-disbursement.js';
import { signIn } from '../support/sign-in.js';

/**
 * Demo video, part 1: what FinRakshak AI is and how it uses AI, then scenario 1 (pre-sanction).
 * Maheep Marketing applies for working capital; its largest customer is in liquidation at the end of
 * a chain of unpaid dues (IBBI). The one-click AI review (document analysis and investigator agent) and FinRakshak Copilot explain the case. The form
 * is filled at once; the voice-over names the values. Application values are TEST inputs from
 * e2e/scenarios/maheep-trade-credit-chain; the public records are real.
 */

const { input } = s;

/** Fills the whole application at once (typing is not worth watching), then continues. */
async function fillApplication(d: Director): Promise<void> {
  const { page } = d;
  await page.getByLabel('Borrower type').selectOption({ label: input.borrowerType });
  await page.getByLabel('Loan product').selectOption({ label: input.product });
  await page.getByLabel('Full name (English / transliterated)').fill(input.signatory);
  await page.getByLabel('Requested amount (₹)').fill(input.amountRupees);
  await page.getByLabel('Tenure (months)').fill(input.tenureMonths);
  await page.getByLabel('Business / firm name').fill(input.business.name);
  await page.getByLabel('PAN of the business').fill(input.business.pan);
  const rows = page.getByRole('list', { name: 'Customers' }).getByRole('listitem');
  for (const [i, c] of input.customers.entries()) {
    await page.getByRole('button', { name: 'Add customer' }).click();
    const row = rows.nth(i);
    await row.getByLabel(`Customer ${i + 1} name`).fill(c.name);
    await row.getByLabel('CIN (optional)').fill(c.cin);
    await row.getByLabel('Outstanding (₹)').fill(c.outstandingRupees);
    await row.getByLabel('Oldest unpaid invoice').fill(c.oldestUnpaid);
  }
  await page.getByLabel('Declared loan purpose').fill(input.purpose);
  await page.getByLabel('Applicant has signed the loan-purpose declaration').check();
  await page.getByLabel('Officer remarks').fill(input.remarks);
  await d.point(page.getByRole('group', { name: /Trade receivables/ }), 1500);
  await d.click(page.getByRole('button', { name: /Continue to risk analysis/ }));
}

async function showChain(d: Director): Promise<void> {
  const { page } = d;
  await d.click(page.getByRole('button', { name: /^(Run|Re-run) public-records check$/ }));
  const chain = page.getByRole('list', { name: /Chain of unpaid dues starting at/ }).first();
  await expect(chain).toBeVisible({ timeout: 90_000 });
  await d.dismissToasts();
  await d.point(chain, 3000);
  if (s.expect.chainStatus !== undefined)
    await d.point(chain.getByText(s.expect.chainStatus).first(), 1500);
  const impact = page.getByRole('region', { name: 'Impact on receivables' });
  if (s.expect.impact !== undefined) {
    await expect.soft(impact).toContainText(s.expect.impact.affectedRupees);
    await expect.soft(impact).toContainText(s.expect.impact.percent);
  }
  await d.say(
    'Eighteen lakh rupees, thirty-six percent of the receivables, is owed by a customer in liquidation.',
  );
  await d.point(impact, 2500);
}

async function showPriorityAndScore(d: Director): Promise<void> {
  const { page } = d;
  await d.click(page.getByRole('button', { name: /^(Run checks|Re-run checks)$/ }));
  const priority = page.getByRole('heading', { name: 'Review priority' }).locator('xpath=../..');
  await expect(priority).toContainText(s.expect.priority, { timeout: 60_000 });
  await d.dismissToasts();
  await d.point(priority, 1500);
  const score = page.locator('section[aria-labelledby="attention-score"]');
  if ((await score.count()) > 0) {
    await d.point(score, 2500);
  }
}

test('Scenario 1 · New loan: customer in liquidation at the end of a chain of unpaid dues', async ({
  page,
}) => {
  const config = readDemoConfig();
  const d = await createDirector(page, config, {
    label: 'Scenario 1',
    scenes: config.DEMO_AI ? 6 : 4,
  });
  await d.goto('/login');
  await d.titleCard(
    {
      kicker: 'FinRakshak AI · Loan lifecycle intelligence',
      title: 'See beyond the balance sheet',
      subtitle: 'Public-record intelligence for safer lending, before and after disbursement.',
      points: [
        'Before you lend: the applicant and its customers are checked against public records.',
        'After you lend: every disbursed loan is watched automatically.',
        'Gemini explains each lead; code verifies every citation.',
      ],
    },
    12,
    'FinRakshak AI is loan lifecycle intelligence for banks. Before a loan is sanctioned, it checks the applicant and its customers against public records. After disbursement, it watches every loan automatically. Gemini explains each lead, and code verifies the evidence.',
  );
  await d.titleCard(
    {
      kicker: 'How FinRakshak uses AI',
      title: 'AI proposes. Code verifies. A person decides.',
      subtitle: 'Gemini on Vertex AI, called only from server functions, never from the browser.',
      points: [
        'AI investigator: a Gemini agent with 8 tools reads a loan application and proposes leads.',
        'FinRakshak Copilot: answers about any record, grounded in its numbered facts.',
        'Background agents: public-records ingestion, evidence extraction, pattern mining, risk explanations.',
        'Guardrails: closed tool lists, schema and number checks, no verdict words, daily cost limits.',
      ],
    },
    12,
    'FinRakshak uses Gemini on Vertex AI in three ways: an investigator agent for each application, a Copilot for any record, and background agents for public records. The rule is simple: AI proposes, code verifies, a person decides.',
  );
  await d.titleCard(
    {
      kicker: 'Scenario 1 · Pre-sanction',
      title: 'A new loan whose biggest customer is in liquidation',
      subtitle: 'Maheep Marketing Pvt Ltd asks for ₹25 lakh of working capital.',
      points: ['Application values are TEST inputs; the public records are real (IBBI).'],
    },
    3,
    'Scenario one: a new loan, checked before a rupee is lent.',
  );

  await d.scene('Sign in', 'A branch manager signs in.', () => signIn(d));

  await d.scene(
    'A new application',
    'The officer enters the application: Maheep Marketing asks for an MSME loan of twenty-five lakh rupees, and names its largest customers, Deep Star Alloys and a test buyer.',
    async () => {
      await d.click(page.getByRole('link', { name: 'New application' }).first());
      await expect(page.getByRole('heading', { name: 'New loan application' })).toBeVisible();
      await fillApplication(d);
    },
  );

  await d.scene(
    'Public-records check',
    'The check follows the chain of unpaid dues behind Deep Star, through Navmi and Maruti Strips, to Yatin Steels, in liquidation. Each link cites an IBBI announcement.',
    () => showChain(d),
  );

  await d.scene(
    'Checks and attention score',
    'All checks run: Urgent review, a lead to verify, not a verdict, with an attention score computed by code, not by the model.',
    () => showPriorityAndScore(d),
  );

  if (config.DEMO_AI) {
    await d.titleCard(
      {
        kicker: 'Inside the AI investigator',
        title: 'An agent that must show its evidence',
        subtitle:
          'Gemini in forced function-calling mode, temperature 0, with a closed list of tools.',
        points: [
          'Reads: get_section · get_ratio · get_public_record_candidates · get_record · get_related_entities',
          'Writes: submit_finding · submit_question · submit_summary',
          'Code checks every claim: the cited field, ratio or record must exist and the quoted value must match.',
          'Rejected claims are counted and never shown as findings.',
        ],
      },
      10,
      'Inside the AI review, the investigator agent can call only eight tools to read the application and submit findings. Code checks every claim and rejects any citation it cannot match.',
    );
    await d.scene(
      'AI review (Gemini)',
      'One click runs the AI review: Gemini analyses the application, and the investigator agent checks the public records. It returns a short headline and at most five verified leads.',
      () => runAiReview(d),
    );
    await d.scene(
      'FinRakshak Copilot',
      'After submitting, the officer asks Copilot why the application was flagged. Every statement must cite the application’s facts.',
      async () => {
        await d.click(page.getByRole('button', { name: 'Submit for review' }));
        await expect(page).toHaveURL(/\/applications\/A-/);
        await d.dismissToasts();
        await askCopilot(d, 'Why was this flagged?');
      },
    );
  }

  await d.finish(
    {
      kicker: 'Scenario 1 · What we saw',
      title: 'Urgent review before a rupee is lent',
      subtitle: 'A customer in liquidation, four links down a chain of unpaid dues.',
      points: [
        '₹18,00,000 of ₹50,00,000 receivables (36%) is at risk.',
        'The AI explains the lead; code verifies every citation; the officer decides.',
      ],
    },
    'Before lending, FinRakshak found a customer in liquidation, and the AI explained it with verified evidence.',
  );
});
