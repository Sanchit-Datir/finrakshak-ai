import { DAY, loanOutflows, time } from './common.js';
import type { RuleConfig, RuleLoan, RuleTransaction } from './types.js';

export interface CashSplitDetection {
  readonly rule: 'cash_split';
  readonly loanId: string;
  readonly transactions: RuleTransaction[];
  readonly totalMinor: number;
  /** Lower bound of the band the withdrawals fell in (the reference × the near percent). */
  readonly lowerMinor: number;
  readonly detectedAt: string;
}

/**
 * `cashMinCount` or more cash withdrawals, each between `cashNearPercent` of the reference amount
 * (inclusive) and the reference amount (exclusive), inside `cashWindowDays`. One detection per loan.
 */
export function detectCashSplit(
  loan: RuleLoan,
  txns: readonly RuleTransaction[],
  cfg: RuleConfig,
): CashSplitDetection[] {
  const lower = (cfg.cashReferenceMinor * cfg.cashNearPercent) / 100;
  const cash = loanOutflows(loan, txns).filter(
    (t) =>
      t.type === 'cash_withdrawal' &&
      t.amountMinor >= lower &&
      t.amountMinor < cfg.cashReferenceMinor,
  );
  for (const anchor of cash) {
    const group = cash.filter(
      (t) =>
        time(t.at) >= time(anchor.at) && time(t.at) - time(anchor.at) <= cfg.cashWindowDays * DAY,
    );
    if (group.length >= cfg.cashMinCount) {
      return [
        {
          rule: 'cash_split',
          loanId: loan.id,
          transactions: group,
          totalMinor: group.reduce((s, t) => s + t.amountMinor, 0),
          lowerMinor: lower,
          detectedAt: group[group.length - 1]?.at ?? anchor.at,
        },
      ];
    }
  }
  return [];
}
