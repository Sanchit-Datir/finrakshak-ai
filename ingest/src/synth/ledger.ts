import { SynthTransactionSchema, type SynthTransaction } from '@finrakshak-ai/shared';

/**
 * Builds a transaction list and checks it as a ledger. Accounts that were opened with a balance are
 * "tracked": their balance may never go below zero (unless allowed). Any other account is outside the
 * bank (a customer's or supplier's) and is not tracked. Money is integer paise (B-01).
 */

export interface LedgerViolation {
  readonly kind: 'duplicate_id' | 'negative_balance';
  readonly txnId: string;
  readonly accountId: string | null;
  readonly detail: string;
}

export class LedgerError extends Error {
  constructor(readonly violations: readonly LedgerViolation[]) {
    super(
      `Ledger is inconsistent: ${violations
        .slice(0, 3)
        .map((v) => v.detail)
        .join('; ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}`,
    );
    this.name = 'LedgerError';
  }
}

/** Time order, then id; plain string comparison so the order never depends on a locale. */
export function compareTxn(a: SynthTransaction, b: SynthTransaction): number {
  const dt = Date.parse(a.at) - Date.parse(b.at);
  if (dt !== 0) return dt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Replays the transactions in order and reports every problem. Does not change its inputs. */
export function checkLedger(
  opening: ReadonlyMap<string, number>,
  txns: readonly SynthTransaction[],
  allowNegative: ReadonlySet<string> = new Set(),
): LedgerViolation[] {
  const out: LedgerViolation[] = [];
  const balances = new Map(opening);
  const seen = new Set<string>();
  for (const t of [...txns].sort(compareTxn)) {
    if (seen.has(t.id))
      out.push({
        kind: 'duplicate_id',
        txnId: t.id,
        accountId: null,
        detail: `id ${t.id} used twice`,
      });
    seen.add(t.id);
    for (const [account, delta] of [
      [t.fromId, -t.amountMinor],
      [t.toId, t.amountMinor],
    ] as const) {
      const before = balances.get(account);
      if (before === undefined) continue;
      const after = before + delta;
      balances.set(account, after);
      if (after < 0 && !allowNegative.has(account))
        out.push({
          kind: 'negative_balance',
          txnId: t.id,
          accountId: account,
          detail: `${account} would be ${after} after ${t.id}`,
        });
    }
  }
  return out;
}

export interface TxnFields {
  readonly id: string;
  readonly loanId: string | null;
  readonly at: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: number;
  readonly type: SynthTransaction['type'];
}

/** A validated synthetic transaction: marked synthetic, source `import`, a reference derived from the id. */
export function synthTxn(fields: TxnFields): SynthTransaction {
  return SynthTransactionSchema.parse({
    ...fields,
    reference: `SYNTH-REF-${fields.id}`,
    source: 'import',
    synthetic: true,
  });
}

export class LedgerBuilder {
  private readonly txns: SynthTransaction[] = [];

  constructor(
    private readonly opening: ReadonlyMap<string, number> = new Map(),
    private readonly allowNegative: ReadonlySet<string> = new Set(),
  ) {}

  add(fields: TxnFields): SynthTransaction {
    const t = synthTxn(fields);
    this.txns.push(t);
    return t;
  }

  /** Sorted transactions, or a `LedgerError` listing what is wrong. */
  build(): SynthTransaction[] {
    const violations = checkLedger(this.opening, this.txns, this.allowNegative);
    if (violations.length > 0) throw new LedgerError(violations);
    return [...this.txns].sort(compareTxn);
  }

  /** Balance of a tracked account after every transaction so far. */
  balance(accountId: string): number {
    let balance = this.opening.get(accountId);
    if (balance === undefined) throw new RangeError(`${accountId} is not a tracked account`);
    for (const t of this.txns) {
      if (t.fromId === accountId) balance -= t.amountMinor;
      if (t.toId === accountId) balance += t.amountMinor;
    }
    return balance;
  }
}
