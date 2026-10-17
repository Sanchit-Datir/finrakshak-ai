import { expect, test } from '@playwright/test';
import { loadLoginData } from './support/data.js';
import { byLabel, demoSignIn } from './support/app.js';

const data = loadLoginData();

test.describe('sign-in form validation', () => {
  for (const c of data.formCases) {
    test(c.name, async ({ page }) => {
      await page.goto('/login');
      await byLabel(page, 'Employee ID or work email').fill(c.userId);
      await byLabel(page, 'Password').fill(c.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();

      for (const message of c.expectErrors) {
        await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
      }
      const notice = page.getByText(/Secure sign-in is not connected/);
      await expect(notice).toBeVisible({ visible: c.expectNotConnectedNotice });
      // Prototype never signs in through the form.
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test.describe('demo sign-in', () => {
  for (const r of data.demoRoles) {
    test(`as ${r.role}`, async ({ page }) => {
      await demoSignIn(page, r.role);
      // The dashboard greets the signed-in user by first name at every viewport width.
      const firstName = r.expectName.split(' ')[0] ?? r.expectName;
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`, ${firstName}`);
    });
  }
});

test.describe('sign out', () => {
  for (const r of data.demoRoles) {
    test(`as ${r.role} returns to the login page and ends the session`, async ({ page }) => {
      await demoSignIn(page, r.role);
      // Visible in the top bar at every viewport width, with no menu to open first.
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      // The session is really gone: a protected page sends you back to the login page.
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});
