import type { AlertKind, ScoreLayer } from '@fund-tracker/shared';

/** Wording for the synthetic risk scores page (leads, never verdicts; B-58). */
export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  none: 'No alert',
  band_up: 'Band went up',
  rise_with_new_reason: 'Rose with a new reason',
  override: 'Record after disbursement',
  initial: 'First score above Routine review',
};

export const LAYER_LABEL: Record<ScoreLayer, string> = {
  direct: 'Public records',
  pattern: 'Patterns',
  graph: 'Related parties',
  behaviour: 'Repayment behaviour',
};
