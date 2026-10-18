import { expect, test } from '@playwright/test';
import { byLabel, demoSignIn } from './support/app.js';

/** A 1×1 PNG: enough for the in-browser intake (no OCR is connected). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('new loan: form first, upload as the alternative', () => {
  test('the form opens directly with an upload option', async ({ page }) => {
    await demoSignIn(page, 'branch_officer');
    await page.goto('/applications/new');
    await expect(byLabel(page, 'Full name (English / transliterated)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload documents instead' })).toBeVisible();
  });

  test('the upload path reaches submission without filling the form', async ({ page }) => {
    await demoSignIn(page, 'branch_officer');
    await page.goto('/applications/new');
    await page.getByRole('button', { name: 'Upload documents instead' }).click();
    await expect(
      page.getByRole('button', { name: /^(Continue to extract & verify|Next)$/ }),
    ).toBeDisabled();

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'TEST-land-record.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page).toHaveURL(/\/applications\/[^/]+\/edit$/);
    await page.getByRole('button', { name: /^(Continue to extract & verify|Next)$/ }).click();

    await expect(page.getByText('The application form is optional.')).toBeVisible();
    await page.getByRole('button', { name: /^(Continue to risk analysis|Next)$/ }).click();
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page).toHaveURL(/\/applications\/[^/]+$/);
    await expect(page.getByText('Needs review').first()).toBeVisible();
  });
});
