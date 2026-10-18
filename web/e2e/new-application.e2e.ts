import { expect, test, type Page } from '@playwright/test';
import { loadApplicationCases, type ApplicationCase } from './support/data.js';
import { applyField, byLabel, demoSignIn } from './support/app.js';

const cases = loadApplicationCases();

async function reachReviewStep(page: Page, c: ApplicationCase): Promise<void> {
  await demoSignIn(page, c.role);
  // The application form opens directly; there is no choice screen first.
  await page.goto('/applications/new');
  await expect(byLabel(page, 'Full name (English / transliterated)')).toBeVisible();
}

test.describe('new loan application workflow', () => {
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await reachReviewStep(page, c);
      for (const field of c.review) await applyField(page, field);
      await page.getByRole('button', { name: 'Continue to risk analysis' }).click();

      if (c.expect.outcome === 'blocked') {
        for (const message of c.expect.errors) {
          await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
        }
        await expect(page.getByText('Please fix the highlighted fields')).toBeVisible();
        return;
      }

      await page.getByRole('button', { name: 'Run checks' }).click();
      await page.getByRole('button', { name: 'Submit for review' }).click();
      await expect(page).toHaveURL(/\/applications\/[^/]+$/);
      await expect(page.getByText('Needs review').first()).toBeVisible();
    });
  }
});
