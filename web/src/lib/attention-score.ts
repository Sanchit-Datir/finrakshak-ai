import type { Application, Priority } from '../domain/schemas.js';
import type { Finding } from './checks.js';

/**
 * How much attention an application needs, 0–100, computed by code from its unresolved check
 * findings (the same ones Review priority uses). Same data, same score: no model sets or changes it
 * (AGENTS_PLAN.md). It is a lead for triage, not a probability or a decision (B-58).
 *
 * Points per unresolved finding: urgent 60, needs attention 30, routine 10; capped at 100. So one
 * urgent finding alone lands in Urgent review, matching Review priority; several smaller findings can
 * add up to a higher band than the single worst one.
 */
export const ATTENTION_POINTS: Readonly<Record<Priority, number>> = {
  urgent: 60,
  needs_attention: 30,
  routine: 10,
};

/** Lower bounds of the bands, in the app's wording (Routine review / Needs attention / Urgent review). */
export const ATTENTION_BANDS = { needs_attention: 30, urgent: 60 } as const;
export const ATTENTION_MAX = 100;
const MAX_DRIVERS = 3;

export interface AttentionDriver {
  readonly findingId: string;
  readonly title: string;
  readonly priority: Priority;
  readonly points: number;
}

export interface AttentionScore {
  readonly score: number;
  readonly band: Priority;
  /** The largest contributors, biggest first (at most 3). */
  readonly drivers: readonly AttentionDriver[];
  /** Unresolved findings counted. */
  readonly counted: number;
}

export function bandOf(score: number): Priority {
  if (score >= ATTENTION_BANDS.urgent) return 'urgent';
  if (score >= ATTENTION_BANDS.needs_attention) return 'needs_attention';
  return 'routine';
}

export function attentionScore(app: Application, findings: readonly Finding[]): AttentionScore {
  const open = findings.filter((f) => {
    const st = app.findingStates[f.id]?.status;
    return st !== 'resolved' && st !== 'not_an_issue';
  });
  const drivers = open
    .map((f) => ({
      findingId: f.id,
      title: f.title,
      priority: f.priority,
      points: ATTENTION_POINTS[f.priority],
    }))
    .sort((a, b) => b.points - a.points || a.title.localeCompare(b.title));
  const score = Math.min(
    ATTENTION_MAX,
    drivers.reduce((sum, d) => sum + d.points, 0),
  );
  return {
    score,
    band: bandOf(score),
    drivers: drivers.slice(0, MAX_DRIVERS),
    counted: open.length,
  };
}
