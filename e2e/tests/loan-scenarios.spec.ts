import { expect, test, type Page } from '@playwright/test';
import { SCENARIOS } from '../scenarios/index.js';
import type { LoanScenario, ScenarioExpectation, ScenarioInput } from '../scenarios/types.js';

/**
 * Runs every loan-application scenario in scenarios/index.ts through the web app: fill the
 * application, run the public-records check and the configured checks, and compare with the
 * scenario's expectations. Screenshots: screenshots/<scenario id>/.
 */

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /Continue with quick sign-in/ }).click();
  await page.waitForURL(/dashboard/);
}

async function dismissToasts(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: 'Dismiss notification' });
  while ((await close.count()) > 0) await close.first().click();
}

async function fillApplication(page: Page, input: ScenarioInput): Promise<void> {
  await page.getByLabel('Borrower type').selectOption({ label: input.borrowerType });
  await page.getByLabel('Loan product').selectOption({ label: input.product });
  await page.getByLabel('Full name (English / transliterated)').fill(input.signatory);
  await page.getByLabel('Requested amount (₹)').fill(input.amountRupees);
  await page.getByLabel('Tenure (months)').fill(input.tenureMonths);
  await page.getByLabel('Business / firm name').fill(input.business.name);
  await page.getByLabel('CIN / registration number').fill(input.business.cin);
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
}

/** Expected companies appear in the chain, in the given order. */
async function expectChain(page: Page, want: ScenarioExpectation): Promise<void> {
  const chain = page.getByRole('list', { name: /Chain of unpaid dues starting at/ });
  if (want.chain === null) {
    await expect(page.getByText(/No customer found in insolvency/)).toBeVisible({
      timeout: 60_000,
    });
    return;
  }
  await expect(chain.first()).toBeVisible({ timeout: 60_000 });
  const text = await chain.first().innerText();
  const positions = want.chain.map((re) => text.search(re));
  expect(positions, `chain order in: ${text}`).toEqual([...positions].sort((a, b) => a - b));
  expect(
    positions.every((p) => p >= 0),
    `all companies in: ${text}`,
  ).toBe(true);
  if (want.chainStatus !== undefined)
    await expect(chain.getByText(want.chainStatus).first()).toBeVisible();
}

async function runScenario(page: Page, s: LoanScenario): Promise<void> {
  const shots = `screenshots/${s.id}`;
  await test.step('Start a new application and fill it', async () => {
    await signIn(page);
    await page.goto('/applications/new');
    await page.getByRole('button', { name: 'Fill the application form' }).click();
    await fillApplication(page, s.input);
    await page
      .getByRole('group', { name: /Trade receivables/ })
      .screenshot({ path: `${shots}/1-receivables-form.png` });
    await page.getByRole('button', { name: /Continue to risk analysis/ }).click();
  });
  await test.step('Run checks (also runs the public-records check)', async () => {
    await page.getByRole('button', { name: /^(Run checks|Re-run checks)$/ }).click();
    await expectChain(page, s.expect);
    if (s.expect.impact !== undefined) {
      const impact = page.getByRole('region', { name: 'Impact on receivables' });
      await expect(impact).toContainText(s.expect.impact.affectedRupees);
      await expect(impact).toContainText(s.expect.impact.percent);
    }
    await dismissToasts(page);
    // A taller viewport keeps the fixed top bar off the card in the screenshot.
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page
      .getByRole('region', { name: 'Public-records check' })
      .screenshot({ path: `${shots}/2-public-records.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await test.step('Review priority and finding', async () => {
    const priorityCard = page
      .getByRole('heading', { name: 'Review priority' })
      .locator('xpath=../..');
    await expect(priorityCard).toContainText(s.expect.priority);
    if (s.expect.finding === undefined) return;
    await page.getByRole('button', { name: s.expect.finding.title }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toContainText(s.expect.finding.detail);
    await page.screenshot({ path: `${shots}/3-finding-detail.png` });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
  await test.step('Phone width: no horizontal scroll', async () => {
    await dismissToasts(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('region', { name: 'Public-records check' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `${shots}/4-mobile.png` });
  });
}

test.beforeAll(async ({ request }) => {
  const published = await request.get('/graph-lab/index.json');
  expect(published.ok(), 'Publish the graph first: node ingest/dist/graphCli.js --web').toBe(true);
});

for (const s of SCENARIOS) {
  test(`${s.id}: ${s.title}`, async ({ page }) => {
    await runScenario(page, s);
  });
}
