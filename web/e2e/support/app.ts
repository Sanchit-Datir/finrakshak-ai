import { expect, type Locator, type Page } from '@playwright/test';
import type { FieldInput, Role } from './data.js';

/** Signs in through the "Quick sign-in" panel on the login page. */
export async function demoSignIn(page: Page, role: Role): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Sign-in role').selectOption(role);
  await page.getByRole('button', { name: 'Continue with quick sign-in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Applies one JSON-described input to the field with that visible label. */
export async function applyField(page: Page, field: FieldInput): Promise<void> {
  const input = byLabel(page, field.label);
  if ('fill' in field) await input.fill(field.fill);
  else if ('select' in field) await input.selectOption({ label: field.select });
  else await input.setChecked(field.check);
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
