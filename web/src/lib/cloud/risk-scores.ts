import {
  GetRiskScoresResultSchema,
  RiskAlertDocSchema,
  RiskExplanationViewSchema,
  RiskHistoryPointSchema,
  RiskHistorySchema,
  RiskScoreViewSchema,
  type RiskAlertDoc,
  type RiskExplanationView,
  type RiskHistoryPoint,
  type RiskScoreView,
} from '@fund-tracker/shared';
import type { Cloud } from './firebase.js';

/** Synthetic risk scores as the app uses them, after every item has been parsed (B-54). */
export interface RiskScores {
  readonly scores: RiskScoreView[];
  readonly alerts: RiskAlertDoc[];
  /** AI-written sentences for some alerts (RISK_EXPLAINER_PLAN.md); always shown labelled. */
  readonly explanations: RiskExplanationView[];
  /** Month-end scores per loan, oldest first. Only the bundled sample has them; empty from the cloud. */
  readonly history: Readonly<Record<string, readonly RiskHistoryPoint[]>>;
  readonly truncated: boolean;
  /** Items dropped because they did not match the shared schema (never shown, never trusted). */
  readonly dropped: number;
  /** Where the data came from: the bundled sample, or the getRiskScores function. */
  readonly origin: 'sample' | 'cloud';
}

/** Parse, don't cast: the envelope must be valid; a malformed item is dropped and counted. */
export function parseRiskScores(raw: unknown, origin: RiskScores['origin']): RiskScores {
  const envelope = GetRiskScoresResultSchema.parse(raw);
  let dropped = 0;
  const keep = <T>(items: readonly unknown[], parse: (x: unknown) => T | null): T[] =>
    items.flatMap((x) => {
      const v = parse(x);
      if (v === null) dropped++;
      return v === null ? [] : [v];
    });
  const scores = keep(envelope.scores, (x) => {
    const p = RiskScoreViewSchema.safeParse(x);
    return p.success ? p.data : null;
  });
  const alerts = keep(envelope.alerts, (x) => {
    const p = RiskAlertDocSchema.safeParse(x);
    return p.success ? p.data : null;
  });
  const explanations = keep(envelope.explanations, (x) => {
    const p = RiskExplanationViewSchema.safeParse(x);
    return p.success ? p.data : null;
  });
  const history = parseHistory(raw);
  return { scores, alerts, explanations, history, truncated: envelope.truncated, dropped, origin };
}

/** Optional `history` key of the sample; anything malformed is left out rather than trusted. */
function parseHistory(raw: unknown): Record<string, RiskHistoryPoint[]> {
  if (typeof raw !== 'object' || raw === null || !('history' in raw)) return {};
  const holder = RiskHistorySchema.safeParse(raw.history);
  if (!holder.success) return {};
  const out: Record<string, RiskHistoryPoint[]> = {};
  for (const [loan, items] of Object.entries(holder.data)) {
    const points = items.flatMap((x) => {
      const p = RiskHistoryPointSchema.safeParse(x);
      return p.success ? [p.data] : [];
    });
    out[loan] = points.sort((a, b) => a.as_of.localeCompare(b.as_of));
  }
  return out;
}

export interface ExplainedAlert {
  readonly alert: RiskAlertDoc;
  readonly explanation: RiskExplanationView;
}

/**
 * The loan's most recent alert with its AI sentence, or null. Only the latest alert counts: an older
 * sentence would describe reasons that may have changed since.
 */
export function latestExplained(data: RiskScores, loanId: string): ExplainedAlert | null {
  const latest = data.alerts
    .filter((a) => a.loan_id === loanId)
    .reduce<RiskAlertDoc | null>(
      (best, a) => (best === null || a.created_at > best.created_at ? a : best),
      null,
    );
  if (latest === null) return null;
  const explanation = data.explanations.find((e) => e.alert_id === latest.alert_id);
  return explanation === undefined ? null : { alert: latest, explanation };
}

/** Calls the `getRiskScores` function; it checks sign-in, App Check and the caller's branch. */
export async function fetchRiskScores(cloud: Cloud): Promise<RiskScores> {
  const { httpsCallable } = await import('@firebase/functions');
  const call = httpsCallable(cloud.functions, 'getRiskScores');
  const response = await call({});
  return parseRiskScores(response.data, 'cloud');
}

/** The bundled sample (output of the scoring core over a few SYNTH loans), loaded on demand. */
export async function loadSampleRiskScores(): Promise<RiskScores> {
  const sample: unknown = (await import('../../demo/synth-risk-sample.json')).default;
  return parseRiskScores(sample, 'sample');
}
