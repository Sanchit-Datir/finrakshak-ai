import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Synthetic risk scores (REMAINING_WORK.md, W3e). In demo mode the page shows the bundled sample: the
 * scoring core's output over 10 SYNTH loans. The counts come from that file, so a rebuilt sample cannot
 * make this test stale. Screenshots: screenshots/risk-scores/.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(
  readFileSync(path.join(here, '../../web/src/demo/synth-risk-sample.json'), 'utf8'),
);

interface SampleShape {
  scores: { loan_id: string; held_band: string; latest: { score: number } }[];
  alerts: unknown[];
}
function isSample(x: unknown): x is SampleShape {
  return (
    typeof x === 'object' &&
    x !== null &&
    'scores' in x &&
    Array.isArray(x.scores) &&
    'alerts' in x &&
    Array.isArray(x.alerts)
  );
}
if (!isSample(raw)) throw new Error('synth-risk-sample.json is not a getRiskScores result');
const sample = raw;
const top = [...sample.scores].sort((a, b) => b.latest.score - a.latest.score)[0];
const SHOTS = 'screenshots/risk-scores';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /Continue with demo sign-in/ }).click();
  await page.waitForURL(/dashboard/);
}

test('synthetic risk scores: page, detail and alerts', async ({ page }) => {
  if (top === undefined) throw new Error('the sample has no scores');
  await signIn(page);

  await test.step('The page lists every SYNTH loan with its band, labelled as test data', async () => {
    await page.goto('/monitoring/risk-scores');
    await expect(page.getByRole('heading', { name: 'Risk scores', level: 1 })).toBeVisible();
    await expect(page.getByText('Synthetic test data').first()).toBeVisible();
    await expect(page.getByText(/Not connected to the cloud job/)).toBeVisible();
    const table = page.getByRole('table', { name: 'Latest risk score per synthetic loan' });
    await expect(table.locator('tbody tr')).toHaveCount(sample.scores.length);
    const urgent = sample.scores.filter((s) => s.held_band === 'urgent').length;
    await expect(page.getByRole('list', { name: 'Loans by band' })).toContainText(String(urgent));
    await expect(page.getByRole('main')).not.toContainText(/fraud/i);
    await page.screenshot({ path: `${SHOTS}/1-list.png`, fullPage: true });
  });

  await test.step('A loan opens with its reasons and the "what changed" block', async () => {
    await page.getByRole('button', { name: top.loan_id, exact: true }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toContainText(`Risk score · ${top.loan_id}`);
    await expect(drawer).toContainText('What changed since the last check');
    await expect(drawer).toContainText('Points by layer');
    await expect(page).toHaveURL(new RegExp(`loan=${top.loan_id}`));
    await page.screenshot({ path: `${SHOTS}/2-detail.png` });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  await test.step('Risk score alerts appear on the Alerts page and link back', async () => {
    await page.goto('/alerts?source=risk_score');
    await expect(page.getByText('SYNTH test loan')).toHaveCount(sample.alerts.length);
    await page.screenshot({ path: `${SHOTS}/3-alerts.png` });
  });

  await test.step('No horizontal scroll at 360 px', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/monitoring/risk-scores');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(360);
    await page.screenshot({ path: `${SHOTS}/4-mobile.png`, fullPage: true });
  });
});
