import {
  RiskScoreViewSchema,
  SCORING_SETTINGS_V2,
  matchPattern,
  monthEnd,
  type GetRiskScoresResult,
  type RiskAlertDoc,
  type RiskLatestDoc,
} from '@fund-tracker/shared';
import { generate } from '../synth/generate.js';
import { scoreDay } from './daily.js';
import { matchRecords } from './fileInputs.js';
import type { ScoringData } from './inputs.js';
import { codePatterns, loadLibrary } from './patternSources.js';
import { monthsFrom } from './replay.js';

/**
 * The app's bundled sample of synthetic risk scores (REMAINING_WORK.md, W3c and W3e), shaped exactly
 * like a `getRiskScores` result. It runs the cloud job's daily step at each month end over a few SYNTH
 * loans (B-54), so the page shows real output of the scoring core when no cloud is connected.
 */

/** Where the web app imports it from (repository-relative). */
export const RISK_SAMPLE_PATH = 'web/src/demo/synth-risk-sample.json';

const SAMPLE_SEED = 20261017;
const SAMPLE_MONTHS = 24;

function sampleData(): ScoringData {
  const d = generate({
    seed: SAMPLE_SEED,
    months: SAMPLE_MONTHS,
    allocation: {
      control: 2,
      slow_burn: 2,
      sudden_enforcement: 2,
      fund_diversion: 1,
      contagion: 1,
      round_trip: 1,
      seasonal: 1,
    },
  });
  const { records, unmatched } = matchRecords(d.flags, d.entities);
  return {
    loans: d.loans,
    transactions: d.transactions,
    entities: d.entities,
    links: d.relationships,
    records,
    seedReview: null,
    dataBuiltOn: null,
    period: null,
    missingInputs: [],
    unmatchedRecords: unmatched,
  };
}

/** The sample never carries AI explanations: no model writes it (CLAUDE.md, simulated output). */
export async function buildRiskSample(): Promise<Omit<GetRiskScoresResult, 'explanations'>> {
  const data = sampleData();
  const library = await loadLibrary(codePatterns());
  let previous = new Map<string, RiskLatestDoc>();
  const alerts = new Map<string, RiskAlertDoc>();
  for (const month of monthsFrom('2024-01', SAMPLE_MONTHS)) {
    const asOf = monthEnd(month);
    const out = scoreDay({
      data,
      asOf,
      runId: `sample_${asOf}`,
      now: `${asOf}T18:30:00.000Z`,
      settings: SCORING_SETTINGS_V2,
      library,
      matcher: matchPattern,
      previous,
    });
    previous = new Map(out.latestDocs.map((doc) => [doc.loan_id, doc]));
    for (const a of out.alertDocs) if (!alerts.has(a.alert_id)) alerts.set(a.alert_id, a);
  }
  return {
    scores: [...previous.values()].map((doc) => RiskScoreViewSchema.parse(doc)),
    alerts: [...alerts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    truncated: false,
  };
}
