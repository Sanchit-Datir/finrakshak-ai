import { test } from '@playwright/test';
import { advantageOverseasPostDisbursement as s } from '../../scenarios/advantage-overseas-post-disbursement/scenario.js';
import { readDemoConfig } from '../support/config.js';
import { createDirector } from '../support/director.js';
import {
  askCopilot,
  closeDialog,
  openAlert,
  openSource,
  openWatchTimeline,
  showBell,
  showLoanBook,
  showWatchOnDashboard,
  walkTimeline,
} from '../support/post-disbursement.js';
import { signIn } from '../support/sign-in.js';

/**
 * Demo video, scenario 2 (post-disbursement): TEST loan L-2023-0601 (₹2 crore, 1 Jun 2023) to
 * Advantage Overseas Pvt Ltd sits in the demo loan book. Nobody types anything: after sign-in the
 * automatic public-records watch finds six records dated after disbursement (insolvency,
 * liquidation, an ED search and three ED attachments) while MCA still lists the company as Active.
 */

test('Scenario 2 · Disbursed loan: Advantage Overseas goes into insolvency, liquidation and ED action', async ({
  page,
}) => {
  const config = readDemoConfig();
  const d = await createDirector(page, config, {
    label: 'Scenario 2',
    scenes: config.DEMO_AI ? 7 : 6,
  });
  await d.goto('/login');
  await d.titleCard(
    {
      kicker: 'Scenario 2 · Post-disbursement',
      title: 'A disbursed loan, and what happened next',
      subtitle: 'A ₹2 crore loan (L-2023-0601) went to Advantage Overseas Pvt Ltd on 1 Jun 2023.',
      points: [
        'Nobody types anything in: the app checks every disbursed loan right after sign-in.',
        'It finds six public records dated after disbursement.',
        'The loan values are TEST data; the borrower and its public records are real.',
      ],
    },
    6,
  );

  await d.scene(
    'Sign in',
    'Signing in starts the automatic public-records watch on the whole loan book.',
    () => signIn(d),
  );

  await d.scene(
    'The watch has already run',
    'Command center: the loan is flagged with 6 records since disbursement, Urgent review.',
    () => showWatchOnDashboard(d, s),
  );

  await d.scene(
    'The bell',
    'Each record raised its own alert, so they also arrive in the bell.',
    () => showBell(d),
  );

  await d.scene(
    'Timeline since disbursement',
    'SBI started insolvency (Nov 2023), liquidation followed (Dec 2024), then ED search and attachments.',
    async () => {
      const watch = await openWatchTimeline(d, s);
      await d.say(
        'MCA still lists the company as “Active”: the master data alone would miss all of this.',
      );
      await d.pause(1500);
      await d.say('Records in date order, each linked to its source document.');
      await walkTimeline(d, watch, s);
      await d.say('Every record opens its source document: here, the IBBI public announcement.');
      await openSource(d, watch.getByRole('link', { name: /Open public record/ }).first());
    },
  );

  await d.scene(
    'The loan in the loan book',
    'The banner on the loan points back to the records and the alerts.',
    () => showLoanBook(d, s),
  );

  await d.scene(
    'An alert, with evidence',
    'Each alert says why it was raised, cites its source and suggests the next step.',
    () => openAlert(d, s),
  );

  if (config.DEMO_AI)
    await d.scene(
      'Ask FinRakshak Copilot',
      'Why was this flagged? Every statement must cite the alert’s own data, or it is removed.',
      () => askCopilot(d, 'Why was this flagged?', 'shortcut'),
    );
  await closeDialog(d);

  await d.finish({
    kicker: 'Scenario 2 · What we saw',
    title: 'Six urgent leads, found without anyone asking',
    subtitle: 'Advantage Overseas: insolvency → liquidation → ED search → ED attachments.',
    points: [
      'Raised automatically after sign-in, on the dashboard, the loan, the Alerts page and the bell.',
      'Every alert links to its public source document.',
      'MCA still says “Active”: the watch reads the records, not just the status.',
    ],
  });
});
