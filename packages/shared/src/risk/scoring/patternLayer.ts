import type { Pattern } from '../patterns/schema.js';
import {
  MatchResultSchema,
  type FlaggedNeighbour,
  type MatchResult,
  type PatternMatcher,
  type SubjectTimeline,
} from '../patterns/timeline.js';
import type { MonitoringRuleId } from '../rules/types.js';
import { roundHalfUp } from './calc.js';
import type { ScoringSettings } from './settings.js';
import type { LayerResult, Reason, ReasonEvidenceStatus, RunFinding } from './types.js';

/**
 * Pattern match layer (max 30), the scorer's half of PATTERN_CONTRACT.md (section 7). Approved patterns
 * only. Points per matched pattern are round(30 × strength × support weight); the layer is the largest
 * single pattern's points, capped at 30, never the sum. The matcher is injected (step 7 builds the
 * real one). A transaction typology is not matched by the matcher: it matches when its monitoring rule
 * fired on the loan. Nothing here writes a pattern or calls a model.
 */

export interface PatternLayerInput {
  readonly patterns: readonly Pattern[];
  readonly matcher: PatternMatcher;
  /** The borrower's public timeline, replay-safe (`timelineFromEvents`). */
  readonly timeline: SubjectTimeline;
  readonly neighbours: readonly FlaggedNeighbour[];
  /** Monitoring rules that fired on this loan, with the transaction ids behind each. */
  readonly firedRules: ReadonlyMap<MonitoringRuleId, readonly string[]>;
  /** Seed cases the owner has verified (data/verification/seed_review.json). */
  readonly verifiedCaseIds: ReadonlySet<string>;
}

export interface PatternLayerResult extends LayerResult {
  readonly findings: readonly RunFinding[];
  /** B-56: no approved pattern to match, so the 0 here is not low risk. */
  readonly noPatterns: boolean;
}

/** 1.0 with enough verified supporting cases, else 0.6; always 0.6 for a hand-written hypothesis. */
export function supportWeight(
  pattern: Pick<Pattern, 'support'>,
  verified: ReadonlySet<string>,
  s: ScoringSettings['pattern'],
): number {
  if (pattern.support.basis === 'hand_written_hypothesis') return s.partial_support_weight;
  const n = pattern.support.supporting_case_ids.filter((id) => verified.has(id)).length;
  return n >= s.verified_cases_for_full_support ? s.full_support_weight : s.partial_support_weight;
}

export const patternPoints = (
  strength: number,
  weight: number,
  s: ScoringSettings['pattern'],
): number => roundHalfUp(s.scale * strength * weight);

type Match = Pick<MatchResult, 'strength' | 'matched_event_ids' | 'matched_neighbour_ids'>;

function matchOne(p: Pattern, input: PatternLayerInput, findings: RunFinding[]): Match | null {
  if (p.definition.template === 'transaction_typology') {
    const ids = input.firedRules.get(p.definition.rule_id);
    return ids === undefined
      ? null
      : { strength: 1, matched_event_ids: [...ids], matched_neighbour_ids: [] };
  }
  let raw: unknown;
  try {
    raw = input.matcher(p, input.timeline, input.neighbours);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'matcher threw';
    findings.push({
      code: 'invalid_match_result',
      detail: `${p.pattern_id}: ${detail}`.slice(0, 200),
    });
    return null;
  }
  if (raw === null) return null;
  const parsed = MatchResultSchema.safeParse(raw);
  if (!parsed.success || parsed.data.pattern_id !== p.pattern_id) {
    findings.push({ code: 'invalid_match_result', detail: p.pattern_id });
    return null;
  }
  return parsed.data;
}

function statusesOf(m: Match, input: PatternLayerInput): ReasonEvidenceStatus[] {
  const byEvent = new Map(input.timeline.events.map((e) => [e.event_id, e.evidence_status]));
  const byNeighbour = new Map(input.neighbours.map((n) => [n.entity_id, n.link_status]));
  const out = new Set<ReasonEvidenceStatus>();
  for (const id of m.matched_event_ids) out.add(byEvent.get(id) ?? 'unknown');
  for (const id of m.matched_neighbour_ids)
    out.add(byNeighbour.get(id) === 'verified' ? 'fact' : 'inference');
  return [...out].sort();
}

function patternReason(
  p: Pattern,
  m: Match,
  weight: number,
  input: PatternLayerInput,
  s: ScoringSettings,
): Reason {
  const isTypology = p.definition.template === 'transaction_typology';
  return {
    code: 'pattern_match',
    layer: 'pattern',
    reason_key: `pattern_match|${p.pattern_id}`,
    subject_id: input.timeline.subject_id,
    points: patternPoints(m.strength, weight, s.pattern),
    evidence_event_ids: [...m.matched_event_ids, ...m.matched_neighbour_ids],
    evidence_statuses: isTypology ? ['fact'] : statusesOf(m, input),
    source: isTypology ? 'transactions' : 'public_records',
    facts:
      p.definition.template === 'transaction_typology'
        ? { template: p.definition.template, rule_id: p.definition.rule_id }
        : { template: p.definition.template },
    pattern: {
      pattern_id: p.pattern_id,
      pattern_name: p.name,
      strength: m.strength,
      support_weight: weight,
    },
  };
}

export function patternLayer(
  input: PatternLayerInput,
  settings: ScoringSettings,
): PatternLayerResult {
  const approved = input.patterns.filter((p) => p.status === 'approved');
  if (approved.length === 0)
    return {
      points: 0,
      reasons: [],
      findings: [{ code: 'no_patterns', detail: 'no approved patterns' }],
      noPatterns: true,
    };
  const findings: RunFinding[] = [];
  const reasons: Reason[] = [];
  for (const p of approved) {
    const m = matchOne(p, input, findings);
    if (m === null) continue;
    const r = patternReason(
      p,
      m,
      supportWeight(p, input.verifiedCaseIds, settings.pattern),
      input,
      settings,
    );
    if (r.points > 0) reasons.push(r);
  }
  const top = Math.max(0, ...reasons.map((r) => r.points));
  return {
    points: Math.min(settings.layer_max.pattern, top),
    reasons,
    findings,
    noPatterns: false,
  };
}
