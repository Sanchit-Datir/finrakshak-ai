import type { InvestigationFinding, InvestigationFindingKind } from '@fund-tracker/shared';
import { AI_FINDING_KIND_LABEL } from '../domain/labels.js';
import type { AiInvestigationSnapshot, Application, Priority } from '../domain/schemas.js';
import type { Finding } from './checks.js';
import { aiFindingStateId } from './investigation-evidence.js';

/**
 * How much attention an application needs, 0–100, computed by code from its unresolved check
 * findings (the same ones Review priority uses). Same data, same score: no model sets or changes it
 * (AGENTS_PLAN.md). It is a lead for triage, not a probability or a decision (B-58).
 *
 * Each kind of finding has its own weight (the points it adds when urgent); a milder version of the
 * same check adds less: needs attention 60%, routine 30%. Points add up, capped at 100. Weights are a
 * starting point set by the owner (18 Oct 2026), not tuned on outcomes.
 */

/** Full points per check (when the finding is urgent). */
export const RULE_POINTS: Readonly<Record<string, number>> = {
  relationship_review: 50,
  duplicate_survey: 45,
  duplicate_receipt: 45,
  income_mismatch: 30,
  name_mismatch: 25,
  dob_conflict: 25,
  encumbrance: 25,
  land_area: 20,
  unclear_fields: 8,
  missing_documents: 8,
  required_fields: 5,
  purpose_declaration: 5,
  failed_documents: 5,
  unreviewed_fields: 5,
  unverified_sections: 5,
};

/** Public-records findings share one rule id; who they are about sets the weight. */
export const PUBLIC_RECORD_POINTS = {
  /** The applicant has an insolvency, liquidation or enforcement record. */
  applicant: 70,
  /** A declared or found customer has one. */
  customer: 45,
  /** The public-records check is out of date or has not run. */
  checkNotCurrent: 25,
} as const;

/**
 * Verified AI-investigator findings count as their own kind (owner, 18 Oct 2026), scaled by priority
 * like rule findings. The model never sets the number: code verified each finding's evidence and
 * code adds these points. Mock, out-of-date and dismissed findings add nothing.
 */
export const AI_FINDING_POINTS: Readonly<Record<InvestigationFindingKind, number>> = {
  public_record_match: 45,
  related_entity_link: 40,
  implausible_numbers: 25,
  section_mismatch: 15,
};

/** A check missing from the tables above (a new rule) still counts, at a middle weight. */
export const DEFAULT_POINTS = 30;

/** Share of the full points by the finding's priority. */
export const PRIORITY_SHARE: Readonly<Record<Priority, number>> = {
  urgent: 100,
  needs_attention: 60,
  routine: 30,
};

function fullPointsOf(f: Finding): number {
  if (f.ruleId === 'public_records') {
    if (f.id === 'pr:not-current') return PUBLIC_RECORD_POINTS.checkNotCurrent;
    return f.id.startsWith('pr:applicant:')
      ? PUBLIC_RECORD_POINTS.applicant
      : PUBLIC_RECORD_POINTS.customer;
  }
  return RULE_POINTS[f.ruleId] ?? DEFAULT_POINTS;
}

/** Points one finding adds: its check's weight, scaled by how severe this instance is. */
export function pointsOf(f: Finding): number {
  return Math.round((fullPointsOf(f) * PRIORITY_SHARE[f.priority]) / 100);
}

/** Lower bounds of the bands, in the app's wording (Routine review / Needs attention / Urgent review). */
export const ATTENTION_BANDS = { needs_attention: 30, urgent: 60 } as const;
export const ATTENTION_MAX = 100;
const MAX_DRIVERS = 3;

export interface AttentionDriver {
  readonly findingId: string;
  /** `ai` for a verified AI-investigator finding. */
  readonly source: 'rule' | 'ai';
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

/**
 * AI findings that count: from a real model, still current, verified (only verified ones are kept),
 * with ids that key their review state for this run.
 */
export function aiFindingsForScore(
  snapshot: AiInvestigationSnapshot | null,
  currentKey: string,
): readonly InvestigationFinding[] {
  if (snapshot === null || snapshot.result.mock || snapshot.inputsKey !== currentKey) return [];
  const at = snapshot.result.investigatedAt;
  return snapshot.result.findings.map((f) => ({ ...f, id: aiFindingStateId(at, f) }));
}

export function aiPointsOf(f: Pick<InvestigationFinding, 'kind' | 'priority'>): number {
  return Math.round((AI_FINDING_POINTS[f.kind] * PRIORITY_SHARE[f.priority]) / 100);
}

export function attentionScore(
  app: Application,
  findings: readonly Finding[],
  ai: readonly InvestigationFinding[] = [],
): AttentionScore {
  const isOpen = (id: string): boolean => {
    const st = app.findingStates[id]?.status;
    return st !== 'resolved' && st !== 'not_an_issue';
  };
  const open = findings.filter((f) => isOpen(f.id));
  const openAi = ai.filter((f) => isOpen(f.id));
  const drivers = [
    ...open.map((f) => ({
      findingId: f.id,
      source: 'rule' as const,
      title: f.title,
      priority: f.priority,
      points: pointsOf(f),
    })),
    ...openAi.map((f) => ({
      findingId: f.id,
      source: 'ai' as const,
      title: AI_FINDING_KIND_LABEL[f.kind],
      priority: f.priority,
      points: aiPointsOf(f),
    })),
  ].sort((a, b) => b.points - a.points || a.title.localeCompare(b.title));
  const score = Math.min(
    ATTENTION_MAX,
    drivers.reduce((sum, d) => sum + d.points, 0),
  );
  return {
    score,
    band: bandOf(score),
    drivers: drivers.slice(0, MAX_DRIVERS),
    counted: open.length + openAi.length,
  };
}
