/**
 * Thresholds for the pattern miner's code (docs/plans/PATTERN_MINER_PLAN.md). They are numbers the owner
 * can change, kept in one place; the model never sets or sees a way to change them.
 */
export interface MinerSettings {
  /** Distinct seed cases a candidate needs before it is proposed (owner's decision: 2). */
  readonly minSupport: number;
  /** Lift against the baseline among entities named in adverse records. 1 = no better than chance. */
  readonly minLift: number;
  /** Entities in the baseline that show the earlier steps; fewer than this is too thin to compare. */
  readonly minPopulation: number;
  /** The earlier steps must come at least this many months before the outcome. */
  readonly minLeadMonths: number;
  /** The gaps the miner tries, smallest first; a definition uses the tightest one that keeps all its cases. */
  readonly gapLadder: readonly number[];
  /** At most this many candidates go on to the model. */
  readonly maxCandidates: number;
  /** Longest sequence tried, outcome included (the schema allows 4). */
  readonly maxSteps: number;
  /** Dates before this are placeholders in the source data (for example 1970-01-01) and are ignored. */
  readonly earliestRealDate: string;
}

export const DEFAULT_MINER_SETTINGS: MinerSettings = {
  minSupport: 2,
  minLift: 1.1,
  minPopulation: 20,
  minLeadMonths: 1,
  gapLadder: [6, 12, 24, 36, 60],
  maxCandidates: 15,
  maxSteps: 3,
  earliestRealDate: '1990-01-01',
};
