import {
  SynthTruthSchema,
  type SynthArchetype,
  type SynthBand,
  type SynthClass,
  type SynthRuleId,
  type SynthTruth,
} from '@finrakshak-ai/shared';
import { monthRange, monthsBetween } from './calendar.js';
import type { Horizon } from './archetypes/types.js';
import type { LoanBase } from './base.js';

/**
 * The expected answer for a loan, month by month. The bands are what the scoring job should produce for the
 * behaviour the scenario generated; they are provisional until checkpoint 2 of docs/plans/README.md, where
 * the cut-offs are tuned. Reason codes are provisional until the scoring plan fixes the real ones.
 */

export const BAND_ORDER: Readonly<Record<SynthBand, number>> = {
  routine: 0,
  needs_attention: 1,
  urgent: 2,
};

export interface MonthState {
  readonly band: SynthBand;
  readonly reasons: readonly string[];
}

export interface TruthSpec {
  readonly archetype: SynthArchetype;
  readonly class: SynthClass;
  readonly onsetMonth: string | null;
  readonly expectedRules: readonly SynthRuleId[];
  /** The state in month `index` (0 = the disbursement month). */
  stateFor(index: number, month: string): MonthState;
}

/** Risk that has appeared stays: the band never falls and reasons are kept once they have appeared. */
export function carryForward(states: readonly MonthState[]): MonthState[] {
  let band: SynthBand = 'routine';
  const seen: string[] = [];
  return states.map((s) => {
    if (BAND_ORDER[s.band] > BAND_ORDER[band]) band = s.band;
    for (const r of s.reasons) if (!seen.includes(r)) seen.push(r);
    return { band, reasons: [...seen] };
  });
}

export function monthsOfLoan(base: LoanBase, horizon: Horizon): string[] {
  return monthRange(base.disbursedMonth, monthsBetween(base.disbursedMonth, horizon.endMonth) + 1);
}

export function buildTruth(base: LoanBase, horizon: Horizon, spec: TruthSpec): SynthTruth {
  const months = monthsOfLoan(base, horizon).map((month, i) => {
    const s = spec.stateFor(i, month);
    return {
      month,
      expected_band: s.band,
      expected_patterns: [],
      expected_reasons: [...s.reasons],
    };
  });
  return SynthTruthSchema.parse({
    loan_id: base.loanId,
    archetype: spec.archetype,
    class: spec.class,
    onset_month: spec.onsetMonth,
    expected_rules: [...spec.expectedRules],
    months,
    synthetic: true,
  });
}
