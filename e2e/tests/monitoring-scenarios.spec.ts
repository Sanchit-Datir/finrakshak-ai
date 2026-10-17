import { expect, test, type Page } from '@playwright/test';
import { MONITORING_SCENARIOS } from '../scenarios/index.js';
import type { MonitoringScenario } from '../scenarios/types.js';

/**
 * Runs every post-disbursement scenario in scenarios/index.ts. Nothing is typed in: after sign-in
 * the automatic public-records watch checks the demo loan book, and the alerts must appear on the
 * dashboard, the Alerts page, the loan in Post-disbursement Monitoring and the watch timeline.
 * Screenshots: screenshots/<scenario id>/.
 */

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /Continue with demo sign-in/ }).click();
  await page.waitForURL(/dashboard/);
}

async function dismissToasts(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: 'Dismiss notification' });
  while ((await close.count()) > 0) await close.first().click();
}

async function runScenario(page: Page, s: MonitoringScenario): Promise<void> {
  const shots = `screenshots/${s.id}`;
  const label = `${s.loanId} · ${s.borrowerName}`;
  await test.step('Sign in: the automatic check flags the loan on the dashboard', async () => {
    await signIn(page);
    const card = page.getByRole('region', { name: 'Public records on disbursed loans' });
    await expect(card.getByRole('link', { name: label })).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(`${s.expectedAlerts} record(s) since disbursement`);
    await dismissToasts(page);
    await card.screenshot({ path: `${shots}/1-dashboard.png` });
  });
  await test.step('Alerts page: one alert per record, opens with evidence', async () => {
    await page.goto('/alerts?source=public_records');
    await expect(page.getByText(label)).toHaveCount(s.expectedAlerts);
    await page.getByRole('button', { name: s.alert.title }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toContainText(s.alert.detail);
    await expect(drawer).toContainText(s.alert.priority);
    await expect(drawer.getByRole('link', { name: /Open public record/ }).first()).toBeVisible();
    await page.screenshot({ path: `${shots}/2-alert-detail.png` });
    await page.keyboard.press('Escape');
  });
  await test.step('Post-disbursement Monitoring: banner on the loan', async () => {
    await page.goto(`/monitoring?loan=${encodeURIComponent(s.loanId)}`);
    await expect(
      page.getByText(`${s.expectedAlerts} public record(s) about this borrower since disbursement`),
    ).toBeVisible();
    await page.screenshot({ path: `${shots}/3-monitoring-banner.png` });
  });
  await test.step('Public-records watch: timeline in date order', async () => {
    await page.getByRole('link', { name: 'See the timeline and evidence' }).click();
    const watch = page.getByRole('region', { name: `Watch ${s.loanId}` });
    const text = await watch.innerText();
    const positions = s.timeline.map((re) => text.search(re));
    expect(
      positions.every((p) => p >= 0),
      `timeline: ${text}`,
    ).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    await page.setViewportSize({ width: 1440, height: 1500 });
    await watch.screenshot({ path: `${shots}/4-timeline.png` });
  });
  await test.step('Phone width: no horizontal scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `${shots}/5-mobile.png` });
  });
}

test.beforeAll(async ({ request }) => {
  const published = await request.get('/graph-lab/index.json');
  expect(published.ok(), 'Publish the graph first: node ingest/dist/graphCli.js --web').toBe(true);
});

for (const s of MONITORING_SCENARIOS) {
  test(`${s.id}: ${s.title}`, async ({ page }) => {
    await runScenario(page, s);
  });
}
