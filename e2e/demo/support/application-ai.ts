import type { Locator } from '@playwright/test';
import type { Director } from './director.js';
import { firstVisible, noticeText } from './wait.js';

/**
 * The two Gemini cards on a new application's Risk step: the AI investigator
 * (investigateApplication) and the AI-assisted analysis with its code-computed attention score
 * (analyseApplication). Both need the account sign-in; with quick sign-in the cards say
 * "Not connected" and the demo shows that instead. A slow or failed model call never stops the demo.
 */

function card(d: Director, title: string): Locator {
  return d.page.locator('.card').filter({ has: d.page.getByText(title, { exact: true }) });
}

/** Clicks the card's run button and waits for its result or its error. */
async function runCard(
  d: Director,
  c: Locator,
  run: RegExp,
  result: Locator,
  failure: string,
  timeout: number,
): Promise<boolean> {
  const button = c.getByRole('button', { name: run });
  if ((await button.count()) === 0) {
    await d.say('Quick sign-in has no cloud account, so no AI model is called here.');
    await d.point(c.getByText(/^Not connected/).first(), 3000);
    return false;
  }
  await d.click(button);
  const outcome = await firstVisible(
    [
      ['ready', result],
      ['failed', c.getByText(failure)],
    ],
    timeout,
  );
  if (outcome === 'ready') {
    await d.dismissToasts();
    return true;
  }
  d.note(
    outcome === 'timeout'
      ? `No AI result within ${timeout / 1000}s.`
      : `The app said: ${await noticeText(c)}`,
  );
  await d.say('The AI did not finish this time; the checks above are unaffected.');
  await d.pause(2500);
  return false;
}

/** AI investigator: Gemini reads the application through tools; code verifies every citation. */
export async function runInvestigator(d: Director): Promise<void> {
  const { page } = d;
  const c = card(d, 'AI investigator');
  const done = await runCard(
    d,
    c,
    /^(Investigate with AI|Re-run investigation|Try again)$/,
    page.locator('#inv-summary'),
    'The AI investigation did not run',
    240_000,
  );
  if (!done) return;
  await d.point(page.locator('section[aria-labelledby="inv-summary"]'), 5000);
  await d.say('Each lead cites its evidence; code rejected anything it could not verify.');
  await d.point(page.locator('section[aria-labelledby="inv-findings"]'), 6000);
  await d.say('Draft questions the officer can put to the applicant.');
  await d.point(page.locator('section[aria-labelledby="inv-questions"]'), 4000);
}

/** Attention score (computed by code), then Gemini's summary of the facts and findings. */
export async function runAnalysis(d: Director): Promise<void> {
  const { page } = d;
  const c = card(d, 'AI-assisted document analysis');
  const score = page.locator('section[aria-labelledby="attention-score"]');
  if ((await score.count()) > 0) {
    await d.say('The attention score is computed by code from the findings, not by the AI.');
    await d.point(score, 4000);
  }
  const done = await runCard(
    d,
    c,
    /^(Analyse with Gemini|Re-run analysis|Try again)$/,
    page.locator('#ai-summary'),
    'The AI analysis did not run',
    120_000,
  );
  if (!done) return;
  await d.say('Gemini summarises the recorded facts and adds a note per finding.');
  await d.point(page.locator('section[aria-labelledby="ai-summary"]'), 5000);
  await d.point(page.locator('section[aria-labelledby="ai-notes"]'), 4000);
}
