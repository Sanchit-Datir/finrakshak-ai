import type { Locator } from '@playwright/test';
import type { Director } from './director.js';
import { firstVisible, noticeText } from './wait.js';

/**
 * The "AI review" card on a new application's Risk step: one click runs the Gemini document
 * analysis (analyseApplication) and the AI investigator agent (investigateApplication) together, and
 * shows a code-built headline with at most five verified leads. It needs the account sign-in; with
 * quick sign-in the card says "Not connected" and the demo points at it instead. A slow or failed
 * model call never stops the demo.
 */

function aiReviewCard(d: Director): Locator {
  return d.page.locator('.card').filter({ has: d.page.getByText('AI review', { exact: true }) });
}

export async function runAiReview(d: Director): Promise<void> {
  const { page } = d;
  const card = aiReviewCard(d);
  const button = card.getByRole('button', { name: /^(Analyse application|Re-run both)$/ });
  if ((await button.count()) === 0) {
    // Quick sign-in: no cloud account, so no model is called; show what the card says instead.
    d.note('Not connected (quick sign-in): showing the AI review card without running it.');
    await d.point(card.getByText(/^Not connected/).first(), 3500);
    return;
  }
  await d.click(button);
  const outcome = await firstVisible(
    [
      ['ready', page.locator('#ai-headline')],
      ['failed', card.getByText(/did not run$/)],
    ],
    240_000,
  );
  if (outcome !== 'ready') {
    d.note(
      outcome === 'timeout'
        ? 'No AI result within 240s.'
        : `The app said: ${await noticeText(card)}`,
    );
    await d.say('The AI did not finish this time; the checks above are unaffected.');
    await d.pause(2500);
    return;
  }
  await d.dismissToasts();
  await d.point(page.locator('section[aria-labelledby="ai-headline"]'), 6000);
}
