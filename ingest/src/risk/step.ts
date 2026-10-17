import {
  changeBlock,
  decideAlert,
  formatChangeBlock,
  type AlertDecision,
  type AlertState,
  type LoanScore,
  type ScoreSnapshot,
  type ScoringSettings,
} from '@fund-tracker/shared';

/**
 * One loan's step from its previous run to this one: the alert decision, the held band and the templated
 * "new / unchanged / score change" text. The replay and the daily job both use it, so a replayed month and
 * a daily run give the same answer.
 */

/** What a loan carries from one run to the next. */
export interface LoanMemory {
  readonly state: AlertState;
  readonly snapshot: ScoreSnapshot;
  /** Every reason key ever alerted; an alerted reason never counts as new again. */
  readonly alerted: ReadonlySet<string>;
}

export interface LoanStep {
  readonly held_band: AlertState['held_band'];
  readonly alert: Pick<AlertDecision, 'kind' | 'delta' | 'new_reason_keys' | 'alert_reason_keys'>;
  readonly change_text: string;
  readonly next: LoanMemory;
}

export function stepLoan(
  prev: LoanMemory | null,
  score: LoanScore,
  settings: ScoringSettings,
): LoanStep {
  const d = decideAlert(prev?.state ?? null, score, settings, prev?.alerted ?? new Set<string>());
  const alerted = new Set([...(prev?.alerted ?? []), ...d.alert_reason_keys]);
  const snapshot: ScoreSnapshot = {
    score: score.score,
    band: d.next.held_band,
    reasons: score.reasons,
  };
  const change_text = formatChangeBlock(changeBlock(prev?.snapshot ?? null, snapshot), {
    staleSince: score.stale_inputs ? score.data_built_on : null,
    noPatterns: score.no_patterns,
  });
  const { kind, delta, new_reason_keys, alert_reason_keys } = d;
  return {
    held_band: d.next.held_band,
    alert: { kind, delta, new_reason_keys, alert_reason_keys },
    change_text,
    next: { state: d.next, snapshot, alerted },
  };
}
