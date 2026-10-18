import {
  detectMonitoring,
  type CashSplitDetection,
  type CircularDetection,
  type LinkedCounterpartyDetection,
  type MonitoringDetection,
  type RapidOnwardDetection,
  type RepeatedCounterpartyDetection,
} from '@fund-tracker/shared';
import type {
  Db,
  Entity,
  Loan,
  MonitoringConfig,
  Priority,
  Relationship,
} from '../domain/schemas.js';
import { formatMoney } from './format.js';

export { linkedEntities, loanOutflows } from '@fund-tracker/shared';

/**
 * Deterministic post-disbursement monitoring rules (spec §11). The detection itself lives in
 * packages/shared (`risk/rules`) so the cloud scoring job runs the same code; this file turns each
 * detection into an alert with its wording. They produce investigative leads, never fraud
 * determinations.
 */

export type MonitoringRuleId =
  'rapid_onward' | 'linked_counterparty' | 'repeated_counterparty' | 'circular' | 'cash_split';

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
    fieldsUsed: [
      'loan.amount',
      'loan.disbursedAt',
      'transaction.at',
      'transaction.amount',
      'transaction.from',
    ],
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

interface Ctx {
  readonly loans: ReadonlyMap<string, Loan>;
  readonly ents: ReadonlyMap<string, Entity>;
  readonly cfg: MonitoringConfig;
}

function rapidAlert(loan: Loan, d: RapidOnwardDetection, cfg: MonitoringConfig): MonitoringAlert {
  return {
    id: monitoringAlertId('rapid_onward', loan.id),
    ruleId: 'rapid_onward',
    loanId: loan.id,
    priority: 'needs_attention',
    title: `${d.percent.toFixed(0)}% of disbursement moved within ${cfg.rapidOnwardHours} h`,
    explanation: `${d.transactions.length} outgoing transfer(s) totalling ${formatMoney(d.totalMinor)} left the credited account within ${cfg.rapidOnwardHours} hours of a ${formatMoney(loan.amountMinor)} disbursement.`,
    threshold: `≥ ${cfg.rapidOnwardPercent}% of disbursed amount`,
    window: `${cfg.rapidOnwardHours} hours from disbursement`,
    transactionIds: d.transactions.map((t) => t.id),
    entityIds: [...new Set(d.transactions.map((t) => t.toId))],
    totalMinor: d.totalMinor,
    totalBasis:
      'Sum of outgoing transfers from the credited account inside the window (repayments excluded).',
    benign: [
      'Payment to a supplier or dealer for the stated purpose (e.g. equipment purchase) is often immediate.',
      'Pre-arranged vendor payments may be made as soon as funds arrive.',
    ],
    steps: [
      'Compare payees with the quotation / pro forma invoice on file.',
      'Request the purchase invoice or delivery proof.',
      'Confirm the asset or inventory physically at site visit.',
    ],
    detectedAt: d.detectedAt,
  };
}

function linkedAlert(
  loan: Loan,
  d: LinkedCounterpartyDetection<Relationship>,
  ents: ReadonlyMap<string, Entity>,
): MonitoringAlert {
  const name = ents.get(d.ownerId)?.name ?? d.ownerId;
  const inferred = d.path.some((r) => r.status === 'inferred');
  return {
    id: monitoringAlertId('linked_counterparty', loan.id, d.ownerId),
    ruleId: 'linked_counterparty',
    loanId: loan.id,
    priority: 'needs_attention',
    title: `Payment to linked entity: ${name}`,
    explanation: `${formatMoney(d.totalMinor)} was paid to ${name}, which is connected to the borrower via ${d.path.length} recorded relationship(s)${inferred ? ' including an inferred (unverified) link' : ''}.`,
    threshold: 'Any outflow to an entity within two relationship hops',
    window: `${loan.monitoringDays} days from disbursement`,
    transactionIds: d.transactions.map((t) => t.id),
    entityIds: [d.ownerId, ...d.path.flatMap((r) => [r.from, r.to])],
    totalMinor: d.totalMinor,
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
    detectedAt: d.detectedAt,
  };
}

function repeatedAlerts(
  d: RepeatedCounterpartyDetection,
  ents: ReadonlyMap<string, Entity>,
  cfg: MonitoringConfig,
): MonitoringAlert[] {
  const name = ents.get(d.counterpartyId)?.name ?? d.counterpartyId;
  return d.loanIds.map((loanId) => ({
    id: monitoringAlertId('repeated_counterparty', loanId, d.counterpartyId),
    ruleId: 'repeated_counterparty',
    loanId,
    priority: 'needs_attention',
    title: `${name} received funds from ${d.loanIds.length} monitored loans`,
    explanation: `${name} received ${d.transactions.length} payment(s) of at least ${formatMoney(cfg.repeatedCounterpartyMinAmountMinor)} from accounts linked to loans ${d.loanIds.join(', ')} within ${Math.ceil(d.spanDays)} days.`,
    threshold: `≥ ${cfg.repeatedCounterpartyMinLoans} loans, each payment ≥ ${formatMoney(cfg.repeatedCounterpartyMinAmountMinor)}`,
    window: `${cfg.repeatedCounterpartyWindowDays} days`,
    transactionIds: d.transactions.map((t) => t.id),
    entityIds: [d.counterpartyId],
    totalMinor: d.totalMinor,
    totalBasis: 'Sum of qualifying payments to the counterparty across all monitored loans.',
    benign: [
      'The counterparty may be a common regional supplier used by many borrowers.',
      'Seasonal purchasing often concentrates on a few dealers.',
    ],
    steps: [
      'Check whether the counterparty is an established supplier for this loan purpose.',
      'Compare invoices across the loans for duplicate invoice numbers or identical amounts.',
    ],
    detectedAt: d.detectedAt,
  }));
}

function circularAlert(loan: Loan, d: CircularDetection, cfg: MonitoringConfig): MonitoringAlert[] {
  const first = d.transactions[0];
  if (first === undefined) return [];
  return [
    {
      id: monitoringAlertId('circular', loan.id, first.id),
      ruleId: 'circular',
      loanId: loan.id,
      priority: 'urgent',
      title: `Funds returned to borrower account after ${d.transactions.length} hops`,
      explanation: `${formatMoney(d.firstMinor)} left the borrower account and ${formatMoney(d.returnedMinor)} (${d.percent.toFixed(0)}%) came back within ${d.days.toFixed(1)} days through ${d.transactions.length - 1} intermediate party(ies).`,
      threshold: `Return ≥ ${cfg.circularMinReturnPercent}% of first transfer`,
      window: `${cfg.circularWindowDays} days from disbursement`,
      transactionIds: d.transactions.map((t) => t.id),
      entityIds: [...new Set(d.transactions.flatMap((t) => [t.fromId, t.toId]))],
      totalMinor: d.firstMinor,
      totalBasis:
        'Amount of the first outgoing transfer in the observed sequence; the return leg is shown separately.',
      benign: [
        'A supplier refund or cancelled order could return funds.',
        "An owner's capital introduction may coincidentally follow a supplier payment.",
      ],
      steps: [
        'Request the supply contract and refund/cancellation documentation.',
        'Verify whether the intermediate party delivered any goods or services.',
        'Escalate to the investigations team if no commercial explanation is documented.',
      ],
      detectedAt: d.detectedAt,
    },
  ];
}

function cashAlert(loan: Loan, d: CashSplitDetection, cfg: MonitoringConfig): MonitoringAlert {
  return {
    id: monitoringAlertId('cash_split', loan.id),
    ruleId: 'cash_split',
    loanId: loan.id,
    priority: 'needs_attention',
    title: `${d.transactions.length} cash withdrawals just below ${formatMoney(cfg.cashReferenceMinor)}`,
    explanation: `${d.transactions.length} cash withdrawals between ${formatMoney(d.lowerMinor)} and ${formatMoney(cfg.cashReferenceMinor)} totalling ${formatMoney(d.totalMinor)} occurred within ${cfg.cashWindowDays} days.`,
    threshold: `${cfg.cashMinCount}+ withdrawals each ${cfg.cashNearPercent}–100% of reference`,
    window: `${cfg.cashWindowDays} days`,
    transactionIds: d.transactions.map((t) => t.id),
    entityIds: [...new Set(d.transactions.map((t) => t.toId))],
    totalMinor: d.totalMinor,
    totalBasis: 'Sum of qualifying cash withdrawals inside the window.',
    benign: [
      'Rural labour and contractor payments are frequently made in cash.',
      'ATM / counter limits can force multiple withdrawals.',
    ],
    steps: [
      'Ask the borrower for the purpose of the cash withdrawals and supporting vouchers.',
      'Check the stated purpose (e.g. installation work) against contractor receipts.',
    ],
    detectedAt: d.detectedAt,
  };
}

function toAlerts(d: MonitoringDetection<Relationship>, ctx: Ctx): MonitoringAlert[] {
  if (d.rule === 'repeated_counterparty') return repeatedAlerts(d, ctx.ents, ctx.cfg);
  const loan = ctx.loans.get(d.loanId);
  if (loan === undefined) return [];
  switch (d.rule) {
    case 'rapid_onward':
      return [rapidAlert(loan, d, ctx.cfg)];
    case 'linked_counterparty':
      return [linkedAlert(loan, d, ctx.ents)];
    case 'circular':
      return circularAlert(loan, d, ctx.cfg);
    case 'cash_split':
      return [cashAlert(loan, d, ctx.cfg)];
  }
}

const cache = new WeakMap<Db, MonitoringAlert[]>();

/** Runs every rule over every loan. Memoised per immutable db snapshot. */
export function runMonitoring(db: Db): MonitoringAlert[] {
  const hit = cache.get(db);
  if (hit !== undefined) return hit;
  const ctx: Ctx = {
    loans: new Map(db.loans.map((l) => [l.id, l])),
    ents: new Map(db.entities.map((e) => [e.id, e])),
    cfg: db.settings.monitoring,
  };
  const detections = detectMonitoring({
    loans: db.loans,
    transactions: db.transactions,
    entities: db.entities,
    relationships: db.relationships,
    config: ctx.cfg,
  });
  const result = detections.flatMap((d) => toAlerts(d, ctx));
  cache.set(db, result);
  return result;
}
