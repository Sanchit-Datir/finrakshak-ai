import { DAY, sortByTime, time } from './common.js';
import type { RuleConfig, RuleLoan, RuleTransaction } from './types.js';

export interface CircularDetection {
  readonly rule: 'circular';
  readonly loanId: string;
  /** The transfers in order: out of the borrower's account, through the parties, and back. */
  readonly transactions: RuleTransaction[];
  readonly firstMinor: number;
  readonly returnedMinor: number;
  /** Returned share of the first transfer, 0–100 (not rounded). */
  readonly percent: number;
  readonly days: number;
  readonly detectedAt: string;
}

/** Longest loop followed, in transfers: out through three parties and back is four. */
const MAX_TRANSFERS = 4;

function findCycles(
  loan: RuleLoan,
  txns: readonly RuleTransaction[],
  cfg: RuleConfig,
): RuleTransaction[][] {
  const start = time(loan.disbursedAt);
  const limit = start + cfg.circularWindowDays * DAY;
  const pool = sortByTime(txns.filter((t) => time(t.at) >= start && time(t.at) <= limit));
  const out: RuleTransaction[][] = [];
  const walk = (node: string, after: number, path: RuleTransaction[]): void => {
    if (path.length >= MAX_TRANSFERS) return;
    for (const t of pool) {
      if (t.fromId !== node || time(t.at) < after || path.includes(t)) continue;
      const next = [...path, t];
      if (t.toId === loan.accountEntityId && next.length >= 2) {
        out.push(next);
      } else if (t.toId !== loan.accountEntityId) {
        walk(t.toId, time(t.at), next);
      }
    }
  };
  for (const first of pool.filter(
    (t) => t.fromId === loan.accountEntityId && t.type !== 'repayment',
  ))
    walk(first.toId, time(first.at), [first]);
  return out;
}

/**
 * A chain of transfers leaves the borrower's account and returns to it within
 * `circularWindowDays` of disbursement, returning at least `circularMinReturnPercent` of the first.
 */
export function detectCircular(
  loan: RuleLoan,
  txns: readonly RuleTransaction[],
  cfg: RuleConfig,
): CircularDetection[] {
  return findCycles(loan, txns, cfg).flatMap((path) => {
    const first = path[0];
    const back = path[path.length - 1];
    if (first === undefined || back === undefined) return [];
    const pct = (back.amountMinor / first.amountMinor) * 100;
    if (pct < cfg.circularMinReturnPercent) return [];
    return [
      {
        rule: 'circular' as const,
        loanId: loan.id,
        transactions: path,
        firstMinor: first.amountMinor,
        returnedMinor: back.amountMinor,
        percent: pct,
        days: (time(back.at) - time(first.at)) / DAY,
        detectedAt: back.at,
      },
    ];
  });
}
