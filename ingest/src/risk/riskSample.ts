import {
  RiskScoreViewSchema,
  SCORING_SETTINGS_V2,
  matchPattern,
  monthEnd,
  type GetRiskScoresResult,
  type Reason,
  type RiskHistoryPoint,
  type RiskExplanationView,
  type RiskAlertDoc,
  type RiskLatestDoc,
} from '@finrakshak-ai/shared';
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

const SAMPLE_EXPLANATIONS = 3;
/** Marks sentences the app must show as "Simulated demo output": no model wrote them. */
export const SAMPLE_EXPLANATION_MODEL = 'bundled-sample';

const an = (w: string): string => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

/** A short phrase from the facts of one recorded reason; null when it is not worded here. */
function phrase(r: Reason): string | null {
  const f = r.facts;
  const words = (v: unknown): string => (typeof v === 'string' ? v.replace(/_/g, ' ') : '');
  switch (r.code) {
    case 'public_record_after_disbursement':
      return `a public record (${words(f['case_type'])}) dated ${String(f['date'])} names the borrower after disbursement`;
    case 'pattern_match':
      return r.pattern === null
        ? null
        : `the public timeline is similar to the pattern "${r.pattern.pattern_name}"`;
    case 'graph_proximity':
      return `an entity with ${an(words(f['kinds']))} record is ${String(f['hops'])} ${f['hops'] === 1 ? 'link' : 'links'} from the borrower`;
    case 'growing_delay':
      return `the delay grew over the last ${String(f['count'])} EMIs`;
    case 'public_record_before_disbursement':
    case 'nfra_finding':
    case 'several_proceedings':
    case 'many_sources':
    case 'related_party_record':
    case 'missed_emi':
    case 'late_emi':
    case 'partial_emi':
    case 'receipts_fall':
      return null;
  }
}

/**
 * Hand-templated sentences for a few alerts of the sample, from the alert's recorded reasons only, so
 * the explainer panel can be seen without the cloud. Not model output: the app labels them as
 * simulated (CLAUDE.md). Alerts whose reasons are not all worded above are skipped.
 */
function sampleExplanations(alerts: readonly RiskAlertDoc[]): RiskExplanationView[] {
  const out: RiskExplanationView[] = [];
  for (const a of alerts) {
    if (out.length >= SAMPLE_EXPLANATIONS) break;
    const parts = a.reasons.filter((r) => r.points > 0).map(phrase);
    const first = parts[0];
    if (first === undefined || first === null || parts.includes(null)) continue;
    const unique = [...new Set(parts)];
    const text = `${unique.join('; ')}.`.replace(/^./, (c) => c.toUpperCase());
    out.push({
      alert_id: a.alert_id,
      loan_id: a.loan_id,
      branch_id: a.branch_id,
      run_id: a.run_id,
      text,
      model: SAMPLE_EXPLANATION_MODEL,
      prompt_version: 'sample',
      created_at: a.created_at,
      synthetic: true,
    });
  }
  return out;
}

/** The sample plus each loan's month-end history, which `getRiskScores` does not return yet. */
export type RiskSample = GetRiskScoresResult & { history: Record<string, RiskHistoryPoint[]> };

export async function buildRiskSample(): Promise<RiskSample> {
  const data = sampleData();
  const library = await loadLibrary(codePatterns());
  let previous = new Map<string, RiskLatestDoc>();
  const alerts = new Map<string, RiskAlertDoc>();
  const history: Record<string, RiskHistoryPoint[]> = {};
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
    for (const doc of out.latestDocs)
      (history[doc.loan_id] ??= []).push({
        as_of: doc.as_of,
        score: doc.latest.score,
        held_band: doc.held_band,
      });
    previous = new Map(out.latestDocs.map((doc) => [doc.loan_id, doc]));
    for (const a of out.alertDocs) if (!alerts.has(a.alert_id)) alerts.set(a.alert_id, a);
  }
  const sorted = [...alerts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    scores: [...previous.values()].map((doc) => RiskScoreViewSchema.parse(doc)),
    alerts: sorted,
    explanations: sampleExplanations(sorted),
    truncated: false,
    history,
  };
}
