import { createEmptyDb } from '../demo/seed.js';
import type {
  Db,
  Entity,
  Loan,
  MonitoringConfig,
  Relationship,
  RelationshipType,
  Transaction,
  TransactionType,
} from '../domain/schemas.js';

/**
 * Test-only builders for hand-made monitoring worlds. They let a test place one transaction at an
 * exact offset from disbursement so a rule's threshold can be checked on both sides of its edge.
 * Every id and name here is fictional.
 */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const DISBURSED_AT = '2026-01-01T00:00:00.000Z';
/** A loan large enough that test transfers never reach the rapid-onward share by accident. */
export const BIG_LOAN = 1_000_000_000_000;

/** The ISO timestamp `offsetMs` after disbursement (negative = before). */
export const at = (offsetMs: number): string =>
  new Date(Date.parse(DISBURSED_AT) + offsetMs).toISOString();

export function entity(
  id: string,
  kind: Entity['kind'],
  name: string,
  ownerId: string | null = null,
): Entity {
  return { id, kind, name, subtitle: 'SYNTH test entity', ownerId, borrowerId: null };
}

/** A company or counterparty plus one account it owns, named `<id>-acc`. */
export function party(id: string, kind: 'company' | 'counterparty' = 'counterparty'): Entity[] {
  return [
    entity(id, kind, `SYNTH ${id}`),
    entity(`${id}-acc`, 'account', `SYNTH ${id} account`, id),
  ];
}

export function loan(id: string, borrower: string, amountMinor: number, monitoringDays = 90): Loan {
  return {
    id,
    applicationId: null,
    borrowerId: borrower,
    product: 'msme_term',
    amountMinor,
    disbursedAt: DISBURSED_AT,
    purpose: 'SYNTH test loan',
    monitoringDays,
    accountEntityId: `${borrower}-acc`,
    dataSource: 'SYNTHETIC TEST DATA',
    lastUpdated: DISBURSED_AT,
    branchId: 'br-test',
  };
}

export function txn(
  id: string,
  from: string,
  to: string,
  amountMinor: number,
  offsetMs: number,
  type: TransactionType = 'neft',
  loanId: string | null = 'L1',
): Transaction {
  return {
    id,
    loanId,
    at: at(offsetMs),
    fromId: from,
    toId: to,
    amountMinor,
    type,
    reference: `REF-${id}`,
    source: 'demo',
  };
}

export function rel(
  id: string,
  from: string,
  to: string,
  type: RelationshipType,
  status: Relationship['status'] = 'verified',
): Relationship {
  return {
    id,
    from,
    to,
    type,
    status,
    source: 'SYNTH test',
    observedAt: DISBURSED_AT,
    evidence: 'SYNTH test',
  };
}

export interface World {
  readonly entities: readonly Entity[];
  readonly loans: readonly Loan[];
  readonly transactions: readonly Transaction[];
  readonly relationships?: readonly Relationship[];
  readonly monitoring?: Partial<MonitoringConfig>;
}

/** A fresh Db (so the per-Db memo never leaks between tests) with the default thresholds. */
export function world(w: World): Db {
  const base = createEmptyDb(new Date('2026-10-15T06:00:00Z'));
  return {
    ...base,
    entities: [...w.entities],
    loans: [...w.loans],
    transactions: [...w.transactions],
    relationships: [...(w.relationships ?? [])],
    settings: { ...base.settings, monitoring: { ...base.settings.monitoring, ...w.monitoring } },
  };
}

/** The usual single-loan world: borrower B with account B-acc, and counterparties C, X, Y, Z. */
export function singleLoan(
  transactions: readonly Transaction[],
  opts: { amountMinor?: number; monitoring?: Partial<MonitoringConfig> } = {},
): Db {
  return world({
    entities: ['B', 'C', 'X', 'Y', 'Z'].flatMap((id) =>
      party(id, id === 'B' ? 'company' : 'counterparty'),
    ),
    loans: [loan('L1', 'B', opts.amountMinor ?? BIG_LOAN)],
    transactions,
    ...(opts.monitoring === undefined ? {} : { monitoring: opts.monitoring }),
  });
}
