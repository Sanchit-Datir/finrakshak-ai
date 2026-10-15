import type {
  Db,
  Entity,
  Loan,
  MonitoringConfig,
  Priority,
  Relationship,
  Transaction,
} from '../domain/schemas.js';
import { formatMoney } from './format.js';

/**
 * Deterministic post-disbursement monitoring rules (spec §11). These run in
 * the browser over the transactions currently loaded. They produce
 * investigative leads, never fraud determinations.
 */

export type MonitoringRuleId =
  | 'rapid_onward'
  | 'linked_counterparty'
  | 'repeated_counterparty'
  | 'circular'
  | 'cash_split';

export interface RuleInfo {
  id: MonitoringRuleId;
  name: string;
  description: string;
  fieldsUsed: string[];
}

export const RULES: Record<MonitoringRuleId, RuleInfo> = {
  rapid_onward: {
    id: 'rapid_onward',
    name: 'Rapid onward transfer after disbursement',
    description:
      'Outflows from the credited account within the configured window reach the configured share of the disbursed amount.',
    fieldsUsed: ['loan.amount', 'loan.disbursedAt', 'transaction.at', 'transaction.amount', 'transaction.from'],
  },
  linked_counterparty: {
    id: 'linked_counterparty',
    name: 'Payment to a counterparty linked to the borrower',
    description:
      'Funds are paid to an entity that already has a recorded relationship (owner, director, guarantor, shared address) with the borrower.',
    fieldsUsed: ['transaction.to', 'relationship.type', 'relationship.status', 'account.owner'],
  },
  repeated_counterparty: {
    id: 'repeated_counterparty',
    name: 'Same counterparty receives funds across loans',
    description:
      'One counterparty receives payments at or above the configured amount from accounts of different monitored loans within the window.',
    fieldsUsed: ['transaction.to', 'transaction.amount', 'transaction.loanId', 'transaction.at'],
  },
  circular: {
    id: 'circular',
    name: 'Potential circular movement',
    description:
      'A chain of observed transfers leaves the borrower account and returns to it within the window, returning at least the configured share of the first transfer.',
    fieldsUsed: ['transaction.from', 'transaction.to', 'transaction.at', 'transaction.amount'],
  },
  cash_split: {
    id: 'cash_split',
    name: 'Split cash withdrawals near reference amount',
    description:
      'Several cash withdrawals, each just below the configured reference amount, occur within a short window.',
    fieldsUsed: ['transaction.type', 'transaction.amount', 'transaction.at'],
  },
};

export interface MonitoringAlert {
  id: string;
  ruleId: MonitoringRuleId;
  loanId: string;
  priority: Priority;
  title: string;
  explanation: string;
  threshold: string;
  window: string;
  transactionIds: string[];
  entityIds: string[];
  totalMinor: number;
  totalBasis: string;
  benign: string[];
  steps: string[];
  detectedAt: string;
}

export function monitoringAlertId(rule: MonitoringRuleId, loanId: string, key = ''): string {
  return key === '' ? `mon:${rule}:${loanId}` : `mon:${rule}:${loanId}:${key}`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function time(iso: string): number {
  return new Date(iso).getTime();
}

function sortByTime(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => time(a.at) - time(b.at));
}

/** Outflows from the loan's credited account after disbursement, in time order. */
export function loanOutflows(loan: Loan, txns: Transaction[]): Transaction[] {
  const start = time(loan.disbursedAt);
  return sortByTime(
    txns.filter(
      (t) =>
        t.fromId === loan.accountEntityId &&
        t.type !== 'repayment' &&
        time(t.at) >= start &&
        time(t.at) <= start + loan.monitoringDays * DAY,
    ),
  );
}

function rapidOnward(loan: Loan, txns: Transaction[], cfg: MonitoringConfig): MonitoringAlert[] {
  const end = time(loan.disbursedAt) + cfg.rapidOnwardHours * HOUR;
  const within = loanOutflows(loan, txns).filter((t) => time(t.at) <= end);
  const total = within.reduce((s, t) => s + t.amountMinor, 0);
  const pct = loan.amountMinor === 0 ? 0 : (total / loan.amountMinor) * 100;
  if (pct < cfg.rapidOnwardPercent || within.length === 0) return [];
  const last = within[within.length - 1];
  return [
    {
      id: monitoringAlertId('rapid_onward', loan.id),
      ruleId: 'rapid_onward',
      loanId: loan.id,
      priority: 'needs_attention',
      title: `${pct.toFixed(0)}% of disbursement moved within ${cfg.rapidOnwardHours} h`,
      explanation: `${within.length} outgoing transfer(s) totalling ${formatMoney(total)} left the credited account within ${cfg.rapidOnwardHours} hours of a ${formatMoney(loan.amountMinor)} disbursement.`,
      threshold: `≥ ${cfg.rapidOnwardPercent}% of disbursed amount`,
      window: `${cfg.rapidOnwardHours} hours from disbursement`,
      transactionIds: within.map((t) => t.id),
      entityIds: [...new Set(within.map((t) => t.toId))],
      totalMinor: total,
      totalBasis: 'Sum of outgoing transfers from the credited account inside the window (repayments excluded).',
      benign: [
        'Payment to a supplier or dealer for the stated purpose (e.g. equipment purchase) is often immediate.',
        'Pre-arranged vendor payments may be made as soon as funds arrive.',
      ],
      steps: [
        'Compare payees with the quotation / pro forma invoice on file.',
        'Request the purchase invoice or delivery proof.',
        'Confirm the asset or inventory physically at site visit.',
      ],
      detectedAt: last?.at ?? loan.disbursedAt,
    },
  ];
}

const LINK_TYPES = new Set(['director_of', 'owner_of', 'guarantor_for', 'shares_address']);

/** Entities connected to `entityId` by one non-account relationship (either direction). */
export function linkedEntities(
  entityId: string,
  rels: Relationship[],
): { entityId: string; rel: Relationship }[] {
  return rels
    .filter((r) => LINK_TYPES.has(r.type) && (r.from === entityId || r.to === entityId))
    .map((r) => ({ entityId: r.from === entityId ? r.to : r.from, rel: r }));
}

function ownerOf(entityId: string, entities: Map<string, Entity>): string {
  return entities.get(entityId)?.ownerId ?? entityId;
}

/** Owners linked to the borrower within two hops (borrower → owner → owner's companies). */
function linkedCircle(borrowerEntity: string, rels: Relationship[]): Map<string, Relationship[]> {
  const out = new Map<string, Relationship[]>();
  for (const a of linkedEntities(borrowerEntity, rels)) {
    out.set(a.entityId, [a.rel]);
    for (const b of linkedEntities(a.entityId, rels)) {
      if (b.entityId !== borrowerEntity && !out.has(b.entityId)) out.set(b.entityId, [a.rel, b.rel]);
    }
  }
  return out;
}

function linkedCounterparty(
  loan: Loan,
  txns: Transaction[],
  ents: Map<string, Entity>,
  rels: Relationship[],
): MonitoringAlert[] {
  const borrowerEntity = ownerOf(loan.accountEntityId, ents);
  const circle = linkedCircle(borrowerEntity, rels);
  const byOwner = new Map<string, Transaction[]>();
  for (const t of loanOutflows(loan, txns)) {
    const owner = ownerOf(t.toId, ents);
    if (owner === borrowerEntity || !circle.has(owner)) continue;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), t]);
  }
  return [...byOwner.entries()].map(([owner, list]) => {
    const path = circle.get(owner) ?? [];
    const total = list.reduce((s, t) => s + t.amountMinor, 0);
    const name = ents.get(owner)?.name ?? owner;
    const inferred = path.some((r) => r.status === 'inferred');
    return {
      id: monitoringAlertId('linked_counterparty', loan.id, owner),
      ruleId: 'linked_counterparty',
      loanId: loan.id,
      priority: 'needs_attention',
      title: `Payment to linked entity: ${name}`,
      explanation: `${formatMoney(total)} was paid to ${name}, which is connected to the borrower via ${path.length} recorded relationship(s)${inferred ? ' including an inferred (unverified) link' : ''}.`,
      threshold: 'Any outflow to an entity within two relationship hops',
      window: `${loan.monitoringDays} days from disbursement`,
      transactionIds: list.map((t) => t.id),
      entityIds: [owner, ...path.flatMap((r) => [r.from, r.to])],
      totalMinor: total,
      totalBasis: 'Sum of outflows from the credited account to accounts held by the linked entity.',
      benign: [
        'Related businesses may legitimately trade with each other at market terms.',
        'A shared director or family relationship does not by itself indicate misuse.',
      ],
      steps: [
        'Obtain invoices / contracts for the payment and check pricing against market.',
        'Confirm goods or services were delivered for the stated purpose.',
        'Record the relationship disclosure in the borrower file.',
      ],
      detectedAt: list[0]?.at ?? loan.disbursedAt,
    } satisfies MonitoringAlert;
  });
}

function repeatedCounterparty(
  loans: Loan[],
  txns: Transaction[],
  ents: Map<string, Entity>,
  cfg: MonitoringConfig,
): MonitoringAlert[] {
  const byCounterparty = new Map<string, { loan: Loan; t: Transaction }[]>();
  for (const loan of loans) {
    for (const t of loanOutflows(loan, txns)) {
      if (t.type === 'cash_withdrawal' || t.amountMinor < cfg.repeatedCounterpartyMinAmountMinor) continue;
      const cp = ownerOf(t.toId, ents);
      byCounterparty.set(cp, [...(byCounterparty.get(cp) ?? []), { loan, t }]);
    }
  }
  const alerts: MonitoringAlert[] = [];
  for (const [cp, hits] of byCounterparty) {
    const sorted = [...hits].sort((a, b) => time(a.t.at) - time(b.t.at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first === undefined || last === undefined) continue;
    const loanIds = [...new Set(sorted.map((h) => h.loan.id))];
    const spanDays = (time(last.t.at) - time(first.t.at)) / DAY;
    if (loanIds.length < cfg.repeatedCounterpartyMinLoans || spanDays > cfg.repeatedCounterpartyWindowDays) continue;
    const total = sorted.reduce((s, h) => s + h.t.amountMinor, 0);
    const name = ents.get(cp)?.name ?? cp;
    for (const loanId of loanIds) {
      alerts.push({
        id: monitoringAlertId('repeated_counterparty', loanId, cp),
        ruleId: 'repeated_counterparty',
        loanId,
        priority: 'needs_attention',
        title: `${name} received funds from ${loanIds.length} monitored loans`,
        explanation: `${name} received ${sorted.length} payment(s) of at least ${formatMoney(cfg.repeatedCounterpartyMinAmountMinor)} from accounts linked to loans ${loanIds.join(', ')} within ${Math.ceil(spanDays)} days.`,
        threshold: `≥ ${cfg.repeatedCounterpartyMinLoans} loans, each payment ≥ ${formatMoney(cfg.repeatedCounterpartyMinAmountMinor)}`,
        window: `${cfg.repeatedCounterpartyWindowDays} days`,
        transactionIds: sorted.map((h) => h.t.id),
        entityIds: [cp],
        totalMinor: total,
        totalBasis: 'Sum of qualifying payments to the counterparty across all monitored loans.',
        benign: [
          'The counterparty may be a common regional supplier used by many borrowers.',
          'Seasonal purchasing often concentrates on a few dealers.',
        ],
        steps: [
          'Check whether the counterparty is an established supplier for this loan purpose.',
          'Compare invoices across the loans for duplicate invoice numbers or identical amounts.',
        ],
        detectedAt: last.t.at,
      });
    }
  }
  return alerts;
}

interface Path {
  txns: Transaction[];
}

function findCycles(loan: Loan, txns: Transaction[], cfg: MonitoringConfig): Path[] {
  const start = time(loan.disbursedAt);
  const limit = start + cfg.circularWindowDays * DAY;
  const pool = sortByTime(txns.filter((t) => time(t.at) >= start && time(t.at) <= limit));
  const out: Path[] = [];
  const walk = (node: string, after: number, path: Transaction[]): void => {
    if (path.length >= 4) return;
    for (const t of pool) {
      if (t.fromId !== node || time(t.at) < after || path.includes(t)) continue;
      const next = [...path, t];
      if (t.toId === loan.accountEntityId && next.length >= 2) {
        out.push({ txns: next });
      } else if (t.toId !== loan.accountEntityId) {
        walk(t.toId, time(t.at), next);
      }
    }
  };
  for (const first of pool.filter((t) => t.fromId === loan.accountEntityId && t.type !== 'repayment')) {
    walk(first.toId, time(first.at), [first]);
  }
  return out;
}

function circular(loan: Loan, txns: Transaction[], cfg: MonitoringConfig): MonitoringAlert[] {
  return findCycles(loan, txns, cfg).flatMap((p) => {
    const first = p.txns[0];
    const back = p.txns[p.txns.length - 1];
    if (first === undefined || back === undefined) return [];
    const pct = (back.amountMinor / first.amountMinor) * 100;
    if (pct < cfg.circularMinReturnPercent) return [];
    const days = (time(back.at) - time(first.at)) / DAY;
    return [
      {
        id: monitoringAlertId('circular', loan.id, first.id),
        ruleId: 'circular',
        loanId: loan.id,
        priority: 'urgent',
        title: `Funds returned to borrower account after ${p.txns.length} hops`,
        explanation: `${formatMoney(first.amountMinor)} left the borrower account and ${formatMoney(back.amountMinor)} (${pct.toFixed(0)}%) came back within ${days.toFixed(1)} days through ${p.txns.length - 1} intermediate party(ies).`,
        threshold: `Return ≥ ${cfg.circularMinReturnPercent}% of first transfer`,
        window: `${cfg.circularWindowDays} days from disbursement`,
        transactionIds: p.txns.map((t) => t.id),
        entityIds: [...new Set(p.txns.flatMap((t) => [t.fromId, t.toId]))],
        totalMinor: first.amountMinor,
        totalBasis: 'Amount of the first outgoing transfer in the observed sequence; the return leg is shown separately.',
        benign: [
          'A supplier refund or cancelled order could return funds.',
          "An owner's capital introduction may coincidentally follow a supplier payment.",
        ],
        steps: [
          'Request the supply contract and refund/cancellation documentation.',
          'Verify whether the intermediate party delivered any goods or services.',
          'Escalate to the investigations team if no commercial explanation is documented.',
        ],
        detectedAt: back.at,
      } satisfies MonitoringAlert,
    ];
  });
}

function cashSplit(loan: Loan, txns: Transaction[], cfg: MonitoringConfig): MonitoringAlert[] {
  const lower = (cfg.cashReferenceMinor * cfg.cashNearPercent) / 100;
  const cash = loanOutflows(loan, txns).filter(
    (t) => t.type === 'cash_withdrawal' && t.amountMinor >= lower && t.amountMinor < cfg.cashReferenceMinor,
  );
  for (let i = 0; i < cash.length; i++) {
    const anchor = cash[i];
    if (anchor === undefined) continue;
    const group = cash.filter((t) => time(t.at) >= time(anchor.at) && time(t.at) - time(anchor.at) <= cfg.cashWindowDays * DAY);
    if (group.length >= cfg.cashMinCount) {
      const total = group.reduce((s, t) => s + t.amountMinor, 0);
      return [
        {
          id: monitoringAlertId('cash_split', loan.id),
          ruleId: 'cash_split',
          loanId: loan.id,
          priority: 'needs_attention',
          title: `${group.length} cash withdrawals just below ${formatMoney(cfg.cashReferenceMinor)}`,
          explanation: `${group.length} cash withdrawals between ${formatMoney(lower)} and ${formatMoney(cfg.cashReferenceMinor)} totalling ${formatMoney(total)} occurred within ${cfg.cashWindowDays} days.`,
          threshold: `${cfg.cashMinCount}+ withdrawals each ${cfg.cashNearPercent}–100% of reference`,
          window: `${cfg.cashWindowDays} days`,
          transactionIds: group.map((t) => t.id),
          entityIds: [...new Set(group.map((t) => t.toId))],
          totalMinor: total,
          totalBasis: 'Sum of qualifying cash withdrawals inside the window.',
          benign: [
            'Rural labour and contractor payments are frequently made in cash.',
            'ATM / counter limits can force multiple withdrawals.',
          ],
          steps: [
            'Ask the borrower for the purpose of the cash withdrawals and supporting vouchers.',
            'Check the stated purpose (e.g. installation work) against contractor receipts.',
          ],
          detectedAt: group[group.length - 1]?.at ?? anchor.at,
        },
      ];
    }
  }
  return [];
}

const cache = new WeakMap<Db, MonitoringAlert[]>();

/** Runs every rule over every loan. Memoised per immutable db snapshot. */
export function runMonitoring(db: Db): MonitoringAlert[] {
  const hit = cache.get(db);
  if (hit !== undefined) return hit;
  const ents = new Map(db.entities.map((e) => [e.id, e]));
  const cfg = db.settings.monitoring;
  const perLoan = db.loans.flatMap((loan) => [
    ...rapidOnward(loan, db.transactions, cfg),
    ...linkedCounterparty(loan, db.transactions, ents, db.relationships),
    ...circular(loan, db.transactions, cfg),
    ...cashSplit(loan, db.transactions, cfg),
  ]);
  const result = [...perLoan, ...repeatedCounterparty(db.loans, db.transactions, ents, cfg)];
  cache.set(db, result);
  return result;
}
