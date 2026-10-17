import type { ScoringSettings } from './settings.js';
import { bandRank, type AlertKind, type LoanScore, type RiskBand } from './types.js';

/**
 * The alert decision (docs/plans/RISK_SCORING_PLAN.md, "Alert decision"). An alert fires when the band
 * steps up, or when the score rises by 15 or more with a new reason; once for a loan whose first score is
 * already above Routine review (`initial`); and when the override reason (a record after disbursement)
 * appears (`override`). A fall raises nothing, and the held band steps down only after 2 clean runs in a
 * row; a stale run neither counts as clean nor resets the count (B-56). A reason already alerted never
 * counts as new again.
 */

/** What the previous run left behind for this loan. */
export interface AlertState {
  readonly score: number;
  /** The band shown and compared against; it lags a fall by the clean-run rule. */
  readonly held_band: RiskBand;
  readonly clean_runs: number;
  readonly reason_keys: readonly string[];
}

export interface AlertDecision {
  readonly kind: AlertKind;
  /** Null for the first score. */
  readonly delta: number | null;
  /** Reasons with points that were not in the previous run and were never alerted. */
  readonly new_reason_keys: readonly string[];
  /** The reasons this alert is about (empty when kind is `none`); the caller records them as alerted. */
  readonly alert_reason_keys: readonly string[];
  readonly next: AlertState;
}

export type ScoredRun = Pick<LoanScore, 'score' | 'band' | 'override' | 'reasons' | 'stale_inputs'>;

const activeKeys = (run: ScoredRun): string[] =>
  [...new Set(run.reasons.filter((r) => r.points > 0).map((r) => r.reason_key))].sort();

function stepDown(
  prev: AlertState,
  run: ScoredRun,
  settings: ScoringSettings,
): Pick<AlertState, 'held_band' | 'clean_runs'> {
  if (bandRank(run.band) >= bandRank(prev.held_band))
    return { held_band: prev.held_band, clean_runs: 0 };
  if (run.stale_inputs) return { held_band: prev.held_band, clean_runs: prev.clean_runs };
  const clean = prev.clean_runs + 1;
  return clean >= settings.alert.clean_runs_to_step_down
    ? { held_band: run.band, clean_runs: 0 }
    : { held_band: prev.held_band, clean_runs: clean };
}

const decision = (
  kind: AlertKind,
  delta: number | null,
  newKeys: readonly string[],
  alertKeys: readonly string[],
  next: AlertState,
): AlertDecision => ({
  kind,
  delta,
  new_reason_keys: newKeys,
  alert_reason_keys: kind === 'none' ? [] : [...new Set(alertKeys)].sort(),
  next,
});

export function decideAlert(
  previous: AlertState | null,
  run: ScoredRun,
  settings: ScoringSettings,
  alreadyAlerted: ReadonlySet<string>,
): AlertDecision {
  const keys = activeKeys(run);
  const before = new Set(previous?.reason_keys ?? []);
  const newKeys = keys.filter((k) => !before.has(k) && !alreadyAlerted.has(k));
  const delta = previous === null ? null : run.score - previous.score;
  const overrideKeys = run.override
    ? run.reasons
        .filter(
          (r) => r.code === 'public_record_after_disbursement' && !alreadyAlerted.has(r.reason_key),
        )
        .map((r) => r.reason_key)
    : [];
  const at = (held_band: RiskBand, clean_runs: number): AlertState => ({
    score: run.score,
    held_band,
    clean_runs,
    reason_keys: keys,
  });
  if (overrideKeys.length > 0)
    return decision('override', delta, newKeys, [...overrideKeys, ...newKeys], at('urgent', 0));
  if (previous === null) {
    const kind = run.band === 'routine' ? 'none' : 'initial';
    return decision(kind, null, newKeys, keys, at(run.band, 0));
  }
  if (bandRank(run.band) > bandRank(previous.held_band))
    return decision(
      'band_up',
      delta,
      newKeys,
      newKeys.length > 0 ? newKeys : keys,
      at(run.band, 0),
    );
  const held = stepDown(previous, run, settings);
  const kind =
    delta !== null && delta >= settings.alert.rise_points && newKeys.length > 0
      ? 'rise_with_new_reason'
      : 'none';
  return decision(kind, delta, newKeys, newKeys, at(held.held_band, held.clean_runs));
}
