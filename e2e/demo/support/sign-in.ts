import type { Director } from './director.js';

const REFUSED_HELP = [
  'Sign-in was refused. What to try:',
  '  - Check DEMO_EMAIL / DEMO_PASSWORD (e2e/demo/.env or the launcher).',
  '  - "app check was not accepted": reCAPTCHA did not trust the automated browser. Register an',
  '    App Check debug token (Firebase console > App Check > Apps > Manage debug tokens) and set',
  '    DEMO_APPCHECK_DEBUG_TOKEN, or try DEMO_BROWSER=chrome.',
  '  - Or record with the prototype quick sign-in: DEMO_SIGN_IN=quick.',
].join('\n');

/** Opens the sign-in page and signs in; ends on the Command center. */
export async function signIn(d: Director): Promise<void> {
  const { page, config } = d;
  if (!new URL(page.url()).pathname.startsWith('/login')) await d.goto('/login');
  await d.pause(800);
  if (config.DEMO_SIGN_IN === 'quick') {
    d.note('Quick sign-in as Branch Manager (prototype, synthetic data).');
    await d.click(page.getByRole('button', { name: /Continue with quick sign-in/ }));
  } else {
    if (config.DEMO_PASSWORD === '')
      throw new Error(
        'No password set. Put DEMO_PASSWORD in e2e/demo/.env, type it in the launcher, or use DEMO_SIGN_IN=quick.',
      );
    await d.set(page.locator('#login-id'), config.DEMO_EMAIL);
    await d.set(page.locator('#login-password'), config.DEMO_PASSWORD);
    await d.click(page.getByRole('button', { name: 'Sign in', exact: true }));
  }
  await waitForSignedIn(d);
}

async function waitForSignedIn(d: Director): Promise<void> {
  const { page } = d;
  const problem = page.locator('form').locator('.bg-danger-soft, .bg-warn-soft').first();
  const timeout = 60_000;
  // Each wait maps its own timeout to a value, so the wait that loses the race cannot reject later.
  const outcome = await Promise.race([
    page
      .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout })
      .then(
        () => 'signed-in' as const,
        () => 'timeout' as const,
      ),
    problem.waitFor({ state: 'visible', timeout }).then(
      () => 'refused' as const,
      () => 'timeout' as const,
    ),
  ]);
  if (outcome === 'timeout')
    throw new Error(`Sign-in did not finish within ${timeout / 1000}s.\n${REFUSED_HELP}`);
  if (outcome === 'refused') {
    const message = (await problem.innerText()).replace(/\s+/g, ' ').trim();
    throw new Error(`${message}\n${REFUSED_HELP}`);
  }
  await page.getByRole('heading', { level: 1 }).first().waitFor();
}
