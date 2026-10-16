import { expect, type Locator, type Page } from '@playwright/test';
import type { FieldInput, Role, SampleRef } from './data.js';

/** Signs in through the "Demo sign-in" panel on the login page. */
export async function demoSignIn(page: Page, role: Role): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Demo role').selectOption(role);
  await page.getByRole('button', { name: 'Continue with demo sign-in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Applies one JSON-described input to the field with that visible label. */
export async function applyField(page: Page, field: FieldInput): Promise<void> {
  const input = byLabel(page, field.label);
  if ('fill' in field) await input.fill(field.fill);
  else if ('select' in field) await input.selectOption({ label: field.select });
  else await input.setChecked(field.check);
}

/** Clicks the sticky step-navigation "next" button (its label is shortened on mobile). */
export async function nextStep(page: Page, desktopLabel: string): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(`^(${escapeRegExp(desktopLabel)}|Next)$`) })
    .click();
}

/** Attaches demo samples from the capture step's "Add demo sample" menu. */
export async function attachSamples(page: Page, samples: readonly SampleRef[]): Promise<void> {
  for (const [i, ref] of samples.entries()) {
    const { title, occurrence } = typeof ref === 'string' ? { title: ref, occurrence: 1 } : ref;
    await page.getByRole('button', { name: 'Add demo sample' }).click();
    await page
      .getByRole('button', { name: title, exact: true })
      .nth(occurrence - 1)
      .click();
    await expect(page.getByText('Demo sample', { exact: true })).toHaveCount(i + 1);
  }
}

/**
 * Finds a field by its visible label. Required fields render a decorative " *"
 * inside the label, so match the label text with or without it.
 */
export function byLabel(page: Page, label: string): Locator {
  return page.getByLabel(new RegExp(`^${escapeRegExp(label)}( \\*)?$`));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
