/**
 * The minimal shapes the monitoring rules read. They are plain structural types, not zod schemas,
 * on purpose: the web app's own domain types (zod 4) and the ingest rows (zod 3) both satisfy them
 * without either side importing the other's schemas. Rows that enter from outside (BigQuery, files)
 * are parsed by the code that loads them, before they reach these functions.
 */

export interface RuleLoan {
  readonly id: string;
  readonly amountMinor: number;
  /** ISO timestamp of disbursement. */
  readonly disbursedAt: string;
  readonly monitoringDays: number;
  /** The entity id of the account the loan was credited to. */
  readonly accountEntityId: string;
}

export interface RuleTransaction {
  readonly id: string;
  /** ISO timestamp. */
  readonly at: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: number;
  /** `repayment` and `cash_withdrawal` have meaning to the rules; any other value is a transfer. */
  readonly type: string;
}

export interface RuleEntity {
  readonly id: string;
  /** For accounts: the entity that owns them. */
  readonly ownerId: string | null;
}

export interface RuleRelationship {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  /** `inferred` links are reported as unverified. */
  readonly status: string;
}

/** Thresholds, in the units the settings use (percent as 0–100, money in minor units). */
export interface RuleConfig {
  readonly rapidOnwardHours: number;
  readonly rapidOnwardPercent: number;
  readonly repeatedCounterpartyMinLoans: number;
  readonly repeatedCounterpartyWindowDays: number;
  readonly repeatedCounterpartyMinAmountMinor: number;
  readonly circularWindowDays: number;
  readonly circularMinReturnPercent: number;
  readonly cashReferenceMinor: number;
  readonly cashNearPercent: number;
  readonly cashMinCount: number;
  readonly cashWindowDays: number;
}

/** The monitoring rules, in the order the detection runs them per loan. */
export const MONITORING_RULE_IDS = [
  'rapid_onward',
  'linked_counterparty',
  'circular',
  'cash_split',
  'repeated_counterparty',
] as const;
export type MonitoringRuleId = (typeof MONITORING_RULE_IDS)[number];
