import { detectCashSplit, type CashSplitDetection } from './cashSplit.js';
import { detectCircular, type CircularDetection } from './circular.js';
import {
  detectLinkedCounterparty,
  type LinkedCounterpartyDetection,
} from './linkedCounterparty.js';
import { detectRapidOnward, type RapidOnwardDetection } from './rapidOnward.js';
import {
  detectRepeatedCounterparty,
  type RepeatedCounterpartyDetection,
} from './repeatedCounterparty.js';
import type {
  RuleConfig,
  RuleEntity,
  RuleLoan,
  RuleRelationship,
  RuleTransaction,
} from './types.js';

export * from './types.js';
export { DAY, HOUR, linkedEntities, loanOutflows } from './common.js';
export type {
  CashSplitDetection,
  CircularDetection,
  LinkedCounterpartyDetection,
  RapidOnwardDetection,
  RepeatedCounterpartyDetection,
};
export {
  detectCashSplit,
  detectCircular,
  detectLinkedCounterparty,
  detectRapidOnward,
  detectRepeatedCounterparty,
};

export type MonitoringDetection<R extends RuleRelationship = RuleRelationship> =
  | RapidOnwardDetection
  | LinkedCounterpartyDetection<R>
  | CircularDetection
  | CashSplitDetection
  | RepeatedCounterpartyDetection;

export interface MonitoringInput<R extends RuleRelationship = RuleRelationship> {
  readonly loans: readonly RuleLoan[];
  readonly transactions: readonly RuleTransaction[];
  readonly entities: readonly RuleEntity[];
  readonly relationships: readonly R[];
  readonly config: RuleConfig;
}

/**
 * Runs every monitoring rule over every loan. The order is part of the contract (the app lists
 * alerts in it): per loan rapid, linked, circular, cash; then the cross-loan repeated-counterparty
 * rule once.
 */
export function detectMonitoring<R extends RuleRelationship>(
  input: MonitoringInput<R>,
): MonitoringDetection<R>[] {
  const ents = new Map(input.entities.map((e) => [e.id, e]));
  const { transactions: txns, config: cfg } = input;
  const perLoan = input.loans.flatMap((loan): MonitoringDetection<R>[] => [
    ...detectRapidOnward(loan, txns, cfg),
    ...detectLinkedCounterparty(loan, txns, ents, input.relationships),
    ...detectCircular(loan, txns, cfg),
    ...detectCashSplit(loan, txns, cfg),
  ]);
  return [...perLoan, ...detectRepeatedCounterparty(input.loans, txns, ents, cfg)];
}
