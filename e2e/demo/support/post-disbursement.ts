import { expect, type Locator } from '@playwright/test';
import type { MonitoringScenario } from '../../scenarios/types.js';
import type { Director } from './director.js';
import { firstVisible } from './wait.js';

/**
 * Steps shared by the post-disbursement demos (scenarios 2 and 3). Nothing is typed in: the
 * automatic public-records watch runs after sign-in and these steps show where its alerts land.
 * Counts are checked softly, so a newer public-records dataset never stops a recording.
 */

function log(line: string): void {
  process.stdout.write(`  · ${line}\n`);
}

function loanLabel(s: MonitoringScenario): string {
  return `${s.loanId} · ${s.borrowerName}`;
}

/** Command center: the watch has run, and the loan is listed with its new records. */
export async function showWatchOnDashboard(d: Director, s: MonitoringScenario): Promise<void> {
  const { page } = d;
  await d.point(page.getByText(/Public records · checked/), 1500);
  const card = page.getByRole('region', { name: 'Public records on disbursed loans' });
  const row = card.getByRole('listitem').filter({ hasText: s.loanId });
  await expect(card.getByRole('link', { name: loanLabel(s) })).toBeVisible({ timeout: 60_000 });
  await d.dismissToasts();
  await d.point(card, 1500);
  await expect.soft(card).toContainText(`${s.expectedAlerts} record(s) since disbursement`);
  await d.point((await row.count()) > 0 ? row.first() : card.getByText(loanLabel(s)), 2500);
}

/** The bell lists the new alerts; Escape closes it. */
export async function showBell(d: Director): Promise<void> {
  const { page } = d;
  const bell = page.getByRole('button', { name: /^Notifications:/ });
  await d.click(bell);
  const panelId = await bell.getAttribute('aria-controls');
  if (panelId !== null) await d.point(page.locator(`[id="${panelId}"]`), 3000);
  await page.keyboard.press('Escape');
  await d.pause(500);
}

/**
 * Alerts page, filtered to the watch, then one alert opened with its evidence. The drawer stays
 * open, so Copilot can be asked about this alert; close it with `closeDialog`.
 */
export async function openAlert(d: Director, s: MonitoringScenario): Promise<void> {
  const { page } = d;
  await d.click(
    page
      .getByRole('navigation')
      .getByRole('link', { name: /^Alerts/ })
      .first(),
  );
  await d.select(page.getByLabel('Source', { exact: true }), 'Public-records watch');
  await expect.soft(page.getByText(loanLabel(s))).toHaveCount(s.expectedAlerts);
  await d.point(page.getByRole('table').first(), 2500);
  await d.click(page.getByRole('button', { name: s.alert.title }).first());
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(s.alert.priority);
  await expect.soft(drawer).toContainText(s.alert.detail);
  await d.point(drawer.getByText(s.alert.detail).first(), 2500);
  await d.point(drawer.getByRole('link', { name: /Open public record/ }).first(), 2000);
}

/** Closes the top-most drawer or dialog. */
export async function closeDialog(d: Director): Promise<void> {
  await d.page.keyboard.press('Escape');
  await d.pause(600);
}

/** Public-records watch page: the loan's card and its timeline, oldest record first. */
export async function openWatchTimeline(d: Director, s: MonitoringScenario): Promise<Locator> {
  const { page } = d;
  await d.click(
    page
      .getByRole('navigation')
      .getByRole('link', { name: /^Public records/ })
      .first(),
  );
  const watch = page.getByRole('region', { name: `Watch ${s.loanId}` });
  await d.point(watch.getByText(/MCA status:/).first(), 2500);
  return watch;
}

export async function walkTimeline(
  d: Director,
  watch: Locator,
  s: MonitoringScenario,
): Promise<void> {
  const timeline = watch.getByRole('list', { name: `Timeline for ${s.loanId}` });
  for (const record of s.timeline) await d.point(timeline.getByText(record).first(), 1600);
}

/**
 * Opens a record's source document (a PDF on ibbi.gov.in or enforcementdirectorate.gov.in) in a
 * new tab for a few seconds. Government sites can be slow, so a late load never stops the demo.
 */
export async function openSource(d: Director, link: Locator): Promise<void> {
  const { page, config } = d;
  if (config.DEMO_HEADLESS) {
    // Headless browsers download PDFs instead of showing them.
    await d.point(link, 1500);
    return;
  }
  const opened = page.context().waitForEvent('page', { timeout: 15_000 });
  await d.click(link);
  const tab = await opened.catch(() => null);
  if (tab === null) {
    log('Source document did not open a new tab; continuing.');
    return;
  }
  try {
    const loaded = await tab.waitForLoadState('load', { timeout: 15_000 }).then(
      () => true,
      () => false,
    );
    if (!loaded) log('Source document is slow to load; showing what has arrived.');
    await tab.waitForTimeout(5000);
  } finally {
    await tab.close();
    await page.bringToFront();
  }
}

/** Loan book: pick the loan; the banner says how many public records arrived since disbursement. */
export async function showLoanBook(d: Director, s: MonitoringScenario): Promise<void> {
  const { page } = d;
  await d.click(
    page
      .getByRole('navigation')
      .getByRole('link', { name: /^Loan book/ })
      .first(),
  );
  await d.select(page.getByLabel('Loan', { exact: true }), `${s.loanId} — ${s.borrowerName}`);
  const banner = page.getByText(
    `${s.expectedAlerts} public record(s) about this borrower since disbursement`,
  );
  await expect.soft(banner).toBeVisible();
  await d.point(page.getByText(/public record\(s\) about this borrower since disbursement/), 3000);
  // Honesty label: real borrower, made-up loan values.
  await d.point(page.getByText(/^Data source: TEST loan/).first(), 2500);
}

/**
 * FinRakshak Copilot on the record on screen: one task button, then the grounded answer.
 * "shortcut" opens it with Ctrl+J, which also works while a drawer (an open alert) is in front.
 */
export async function askCopilot(
  d: Director,
  task: string,
  open: 'button' | 'shortcut' = 'button',
): Promise<void> {
  const { page } = d;
  if (open === 'button')
    await d.click(page.getByRole('button', { name: /Ask FinRakshak Copilot/ }));
  else {
    await d.say('Ctrl + J opens FinRakshak Copilot on the record in front: this alert.');
    await page.keyboard.press('Control+j');
  }
  const panel = page.getByRole('dialog').filter({ hasText: 'FinRakshak Copilot' });
  await d.click(panel.getByRole('button', { name: task }));
  const answer = panel.locator('article').last();
  const outcome = await firstVisible(
    [
      ['answered', answer.locator('h3')],
      ['failed', answer.getByText('The copilot did not answer')],
    ],
    120_000,
  );
  if (outcome !== 'answered') {
    await d.say('The copilot did not answer this time; the rest of the demo is unaffected.');
    await d.pause(2500);
  } else {
    await d.point(answer.locator('h3'), 2500);
    await d.point(answer, 7000);
  }
  await closeDialog(d);
}
