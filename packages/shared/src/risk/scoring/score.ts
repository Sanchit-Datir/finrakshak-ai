import { daysBetween } from './calc.js';
import type { DirectResult } from './direct.js';
import type { PatternLayerResult } from './patternLayer.js';
import type { ScoringSettings } from './settings.js';
import type { LayerResult, LoanScore, RiskBand } from './types.js';

/**
 * Combines the four layers into one score (sum, capped at 100), its band, and the override. The band
 * cut-offs are Routine review below 30, Needs attention 30–59, Urgent review 60 and above. A score is a
 * lead for a reviewer, never a verdict, and no action is taken from it automatically (B-58).
 */

export function bandOf(score: number, settings: ScoringSettings): RiskBand {
  if (score >= settings.bands.urgent_from) return 'urgent';
  return score >= settings.bands.needs_attention_from ? 'needs_attention' : 'routine';
}

/** B-56: public data older than `stale_after_days` days on the scoring day is stale. */
export const isStale = (dataBuiltOn: string, asOf: string, settings: ScoringSettings): boolean =>
  daysBetween(dataBuiltOn, asOf) > settings.stale_after_days;

/** Deterministic, so a re-run for the same day, settings and library is the same row (B-24). */
export const scoreIdOf = (
  loanId: string,
  asOf: string,
  settingsVersion: string,
  patternVersion: number | null,
): string => `score_${loanId}_${asOf}_${settingsVersion}_p${patternVersion ?? 'none'}`;

export interface CombineInput {
  readonly loanId: string;
  readonly borrowerId: string;
  readonly asOf: string;
  readonly dataBuiltOn: string;
  /** Inputs the loader could not provide; any one marks the score stale (B-56). */
  readonly missingInputs: readonly string[];
  readonly patternVersion: number | null;
  readonly direct: DirectResult;
  readonly pattern: PatternLayerResult;
  readonly graph: LayerResult;
  readonly behaviour: LayerResult;
}

export function combineLayers(input: CombineInput, settings: ScoringSettings): LoanScore {
  const points = {
    direct: input.direct.points,
    pattern: input.pattern.points,
    graph: input.graph.points,
    behaviour: input.behaviour.points,
  };
  const score = Math.min(100, points.direct + points.pattern + points.graph + points.behaviour);
  const override = input.direct.override;
  return {
    score_id: scoreIdOf(input.loanId, input.asOf, settings.settings_version, input.patternVersion),
    loan_id: input.loanId,
    borrower_id: input.borrowerId,
    as_of: input.asOf,
    score,
    band: override ? 'urgent' : bandOf(score, settings),
    override,
    points,
    reasons: [
      ...input.direct.reasons,
      ...input.pattern.reasons,
      ...input.graph.reasons,
      ...input.behaviour.reasons,
    ],
    settings_version: settings.settings_version,
    pattern_version: input.patternVersion,
    data_built_on: input.dataBuiltOn,
    stale_inputs:
      input.missingInputs.length > 0 || isStale(input.dataBuiltOn, input.asOf, settings),
    no_patterns: input.pattern.noPatterns,
  };
}
