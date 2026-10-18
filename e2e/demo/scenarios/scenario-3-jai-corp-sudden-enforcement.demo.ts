import { test } from '@playwright/test';
import { jaiCorpSuddenEnforcement as s } from '../../scenarios/jai-corp-sudden-enforcement/scenario.js';
import { readDemoConfig } from '../support/config.js';
import { createDirector } from '../support/director.js';
import {
  askCopilot,
  closeDialog,
  openAlert,
  openSource,
  openWatchTimeline,
  showLoanBook,
  showWatchOnDashboard,
  walkTimeline,
} from '../support/post-disbursement.js';
import { signIn } from '../support/sign-in.js';

/**
 * Demo video, scenario 3 (post-disbursement): TEST loan L-2024-0401 (₹5 crore, 1 Apr 2024) to
 * Jai Corp Limited, a listed company. At onboarding it was clean: no insolvency or enforcement
 * record against it (its 2020–22 filings against three of its own customers are context only).
 * On 6 Oct 2026 ED provisionally attached ₹230 crore of property "against Jai Corp Limited and
 * others", and the automatic watch raises one Urgent review alert after sign-in.
 */

test('Scenario 3 · Disbursed loan: a clean, listed borrower suddenly faces an ED attachment', async ({
  page,
}) => {
  const config = readDemoConfig();
  const d = await createDirector(page, config, {
    label: 'Scenario 3',
    scenes: config.DEMO_AI ? 6 : 5,
  });
  await d.goto('/login');
  await d.titleCard(
    {
      kicker: 'Scenario 3 · Post-disbursement',
      title: 'A clean, listed borrower suddenly faces enforcement',
      subtitle: 'A ₹5 crore loan (L-2024-0401) went to Jai Corp Limited on 1 Apr 2024.',
      points: [
        'At onboarding: no insolvency or enforcement record against Jai Corp.',
        'On 6 Oct 2026, ED provisionally attached ₹230 crore of property.',
        'The loan values are TEST data; the borrower and its public records are real.',
      ],
    },
    6,
  );

  await d.scene('Sign in', 'Nobody types anything in: the watch runs right after sign-in.', () =>
    signIn(d),
  );

  await d.scene(
    'One new record since disbursement',
    'Command center: Jai Corp now has 1 record since disbursement, Urgent review.',
    () => showWatchOnDashboard(d, s),
  );

  await d.scene(
    'Clean at onboarding, enforcement after',
    'The timeline separates what was known before the loan from what happened after it.',
    async () => {
      const watch = await openWatchTimeline(d, s);
      // Records about Jai Corp itself dated before the loan; its filings against customers are not.
      const before = watch.getByRole('region', { name: 'Known before disbursement' });
      if ((await before.count()) > 0) {
        await d.say('Already public before the loan: context only, no alert.');
        await d.point(before, 4000);
      } else {
        await d.say(
          'At disbursement: no insolvency or enforcement record against Jai Corp, so no alert.',
        );
        const timeline = watch.getByRole('list', { name: `Timeline for ${s.loanId}` });
        await d.point(timeline.getByRole('listitem').first(), 3000);
      }
      await d.say(
        'After the loan: ED provisionally attached ₹230 crore of property “against Jai Corp Limited and others”.',
      );
      await walkTimeline(d, watch, s);
      await openSource(d, watch.getByRole('link', { name: /Open public record/ }).first());
    },
  );

  await d.scene(
    'The loan in the loan book',
    'The loan itself carries the banner, linked to the record and its alert.',
    () => showLoanBook(d, s),
  );

  await d.scene(
    'The alert, with evidence',
    'One Urgent review alert, with the reason, the source and the suggested next step.',
    () => openAlert(d, s),
  );

  if (config.DEMO_AI)
    await d.scene(
      'Ask FinRakshak Copilot',
      'What should the officer verify next? Each step is tied to the evidence that needs it.',
      () => askCopilot(d, 'What should I verify next?', 'shortcut'),
    );
  await closeDialog(d);

  await d.finish({
    kicker: 'Scenario 3 · What we saw',
    title: 'From clean to Urgent review, the day the record appeared',
    subtitle:
      'Jai Corp Limited: no adverse record at onboarding, an ED attachment after disbursement.',
    points: [
      'Context known before the loan stays context; only the new record raised an alert.',
      'The alert links to the ED press release.',
      'Leads to verify, never a verdict on the borrower.',
    ],
  });
});
