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
  showWatchOnDashboard,
  walkTimeline,
} from '../support/post-disbursement.js';
import { signIn } from '../support/sign-in.js';

/**
 * Demo video, part 2: scenario 2 (post-disbursement). TEST loan L-2023-0601 (₹2 crore, 1 Jun 2023)
 * to Advantage Overseas Pvt Ltd. Nobody types anything: after sign-in the automatic public-records
 * watch finds six records dated after disbursement. FinRakshak Copilot explains an alert and plans
 * the next checks; a closing card shows the agents behind the scenes.
 */

test('Scenario 2 · Disbursed loan: Advantage Overseas goes into insolvency, liquidation and ED action', async ({
  page,
}) => {
  const config = readDemoConfig();
  const d = await createDirector(page, config, {
    label: 'Scenario 2',
    scenes: config.DEMO_AI ? 5 : 4,
  });
  await d.goto('/login');
  await d.titleCard(
    {
      kicker: 'Scenario 2 · Post-disbursement',
      title: 'A disbursed loan, and what happened next',
      subtitle: 'A ₹2 crore loan (L-2023-0601) went to Advantage Overseas Pvt Ltd on 1 Jun 2023.',
      points: ['The loan values are TEST data; the borrower and its public records are real.'],
    },
    3,
    'Scenario two: a loan already disbursed, and what happened next.',
  );

  await d.scene(
    'Sign in',
    'Signing in starts an automatic check of every disbursed loan against public records.',
    () => signIn(d),
  );

  await d.scene(
    'The watch has already run',
    'Every night, new IBBI, ED, RBI and SEBI records are collected and an agent reviews the run. The watch found six new records about Advantage Overseas, each an urgent alert.',
    async () => {
      await showWatchOnDashboard(d, s);
      await showBell(d);
    },
  );

  await d.scene(
    'Public records: the timeline',
    'Insolvency in 2023, liquidation in 2024, then Enforcement Directorate searches and attachments. Yet MCA still lists the company as active.',
    async () => {
      const watch = await openWatchTimeline(d, s);
      await walkTimeline(d, watch, s);
      await d.say('Every record links to its public source document.');
      await openSource(d, watch.getByRole('link', { name: /Open public record/ }).first());
    },
  );

  await d.scene(
    'An alert, with evidence',
    'Each alert explains why it was raised, cites its source and suggests the next check.',
    () => openAlert(d, s),
  );

  if (config.DEMO_AI) {
    await d.scene(
      'FinRakshak Copilot on the alert',
      'Control J opens Copilot on this alert. Gemini answers only from the record’s numbered facts, and uncited statements are removed.',
      async () => {
        await askCopilot(d, 'Why was this flagged?', 'shortcut');
      },
    );
  }
  await closeDialog(d);

  await d.titleCard(
    {
      kicker: 'Behind the scenes',
      title: 'Four agents, one rule',
      subtitle: 'Code computes the facts, the model puts them into words, a person decides.',
      points: [
        'Ingestion agent: reviews every nightly public-records run and proposes actions.',
        'Evidence extractor: reads new documents in shadow mode until it passes a quality gate.',
        'Pattern miner: proposes risk patterns from past defaults, for a person to approve.',
        'Risk explainer: writes a plain-language reason for each risk alert, checked by code.',
      ],
    },
    10,
    'Behind the scenes, four agents follow the same rule: they review each nightly data run, extract evidence, mine risk patterns and explain risk alerts. Code checks them, and a person approves.',
  );

  await d.finish(
    {
      kicker: 'FinRakshak AI',
      title: 'Leads you can verify, found before they cost you',
      subtitle:
        'Advantage Overseas: six urgent leads, found automatically, each with its public source.',
      points: [
        'AI proposes. Code verifies. A person decides.',
        'Built on Gemini, Vertex AI and Firebase.',
      ],
    },
    'FinRakshak AI: leads you can verify, found before they cost you. Thank you.',
  );
});
