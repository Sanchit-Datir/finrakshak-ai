import { DAY, loanOutflows, ownerOf, time } from './common.js';
import type { RuleConfig, RuleEntity, RuleLoan, RuleTransaction } from './types.js';

export interface RepeatedCounterpartyDetection {
  readonly rule: 'repeated_counterparty';
  /** The entity (not the account) that received the money. */
  readonly counterpartyId: string;
  /** The loans that paid it, in the order of their first qualifying payment. */
  readonly loanIds: string[];
  /** Every qualifying payment across those loans, in time order. */
  readonly transactions: RuleTransaction[];
  readonly spanDays: number;
  readonly totalMinor: number;
  readonly detectedAt: string;
}

interface Hit {
  readonly loanId: string;
  readonly t: RuleTransaction;
}

/**
 * One counterparty receives payments of at least `repeatedCounterpartyMinAmountMinor` (cash
 * withdrawals excluded) from `repeatedCounterpartyMinLoans` or more loans, all within
 * `repeatedCounterpartyWindowDays`. One detection per counterparty; the caller raises one alert per loan.
 */
export function detectRepeatedCounterparty(
  loans: readonly RuleLoan[],
  txns: readonly RuleTransaction[],
  entities: ReadonlyMap<string, RuleEntity>,
  cfg: RuleConfig,
): RepeatedCounterpartyDetection[] {
  const byCounterparty = new Map<string, Hit[]>();
  for (const loan of loans) {
    for (const t of loanOutflows(loan, txns)) {
      if (t.type === 'cash_withdrawal' || t.amountMinor < cfg.repeatedCounterpartyMinAmountMinor)
        continue;
      const cp = ownerOf(t.toId, entities);
      byCounterparty.set(cp, [...(byCounterparty.get(cp) ?? []), { loanId: loan.id, t }]);
    }
  }
  const out: RepeatedCounterpartyDetection[] = [];
  for (const [cp, hits] of byCounterparty) {
    const sorted = [...hits].sort((a, b) => time(a.t.at) - time(b.t.at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first === undefined || last === undefined) continue;
    const loanIds = [...new Set(sorted.map((h) => h.loanId))];
    const spanDays = (time(last.t.at) - time(first.t.at)) / DAY;
    if (
      loanIds.length < cfg.repeatedCounterpartyMinLoans ||
      spanDays > cfg.repeatedCounterpartyWindowDays
    )
      continue;
    out.push({
      rule: 'repeated_counterparty',
      counterpartyId: cp,
      loanIds,
      transactions: sorted.map((h) => h.t),
      spanDays,
      totalMinor: sorted.reduce((s, h) => s + h.t.amountMinor, 0),
      detectedAt: last.t.at,
    });
  }
  return out;
}
