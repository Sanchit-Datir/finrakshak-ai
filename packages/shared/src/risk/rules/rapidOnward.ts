import { HOUR, loanOutflows, time } from './common.js';
import type { RuleConfig, RuleLoan, RuleTransaction } from './types.js';

export interface RapidOnwardDetection {
  readonly rule: 'rapid_onward';
  readonly loanId: string;
  /** Share of the disbursed amount that left inside the window, 0–100 (not rounded). */
  readonly percent: number;
  readonly transactions: RuleTransaction[];
  readonly totalMinor: number;
  readonly detectedAt: string;
}

/** At least `rapidOnwardPercent` of the disbursement leaves within `rapidOnwardHours`. */
export function detectRapidOnward(
  loan: RuleLoan,
  txns: readonly RuleTransaction[],
  cfg: RuleConfig,
): RapidOnwardDetection[] {
  const end = time(loan.disbursedAt) + cfg.rapidOnwardHours * HOUR;
  const within = loanOutflows(loan, txns).filter((t) => time(t.at) <= end);
  const total = within.reduce((s, t) => s + t.amountMinor, 0);
  const pct = loan.amountMinor === 0 ? 0 : (total / loan.amountMinor) * 100;
  if (pct < cfg.rapidOnwardPercent || within.length === 0) return [];
  const last = within[within.length - 1];
  return [
    {
      rule: 'rapid_onward',
      loanId: loan.id,
      percent: pct,
      transactions: within,
      totalMinor: total,
      detectedAt: last?.at ?? loan.disbursedAt,
    },
  ];
}
