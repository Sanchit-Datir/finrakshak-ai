import { describe, expect, it } from 'vitest';
import { createEmptyDb } from '../demo/seed.js';
import {
  EntitySchema,
  LoanSchema,
  RelationshipSchema,
  TransactionSchema,
} from '../domain/schemas.js';
import { runMonitoring } from './monitoring.js';
import sample from './synth-sample.json';

/**
 * Contract between the synthetic data generator (ingest/src/synth) and the app. The sample holds a few
 * generated loans; this loads them into the app's own types and runs the app's own monitoring rules, then
 * checks that each loan raises exactly the rules its label expects. If the generator or the web model
 * changes so that they no longer fit, this fails (docs/plans/SYNTHETIC_TRANSACTIONS_PLAN.md).
 */

const db = {
  ...createEmptyDb(new Date('2026-10-15T06:00:00Z')),
  entities: EntitySchema.array().parse(sample.entities),
  relationships: RelationshipSchema.array().parse(sample.relationships),
  loans: LoanSchema.array().parse(sample.loans),
  transactions: TransactionSchema.array().parse(sample.transactions),
};
const alerts = runMonitoring(db);
const rulesOf = (loanId: string): string[] =>
  alerts
    .filter((a) => a.loanId === loanId)
    .map((a) => a.ruleId)
    .sort();

describe('synthetic sample in the app', () => {
  it('is accepted by the app’s own schemas, row for row', () => {
    expect(db.loans).toHaveLength(sample.loans.length);
    expect(db.transactions).toHaveLength(sample.transactions.length);
    expect(db.entities).toHaveLength(sample.entities.length);
    expect(sample.synthetic).toBe(true);
    expect(db.loans.every((l) => l.dataSource === 'SYNTHETIC TEST DATA')).toBe(true);
    expect(db.entities.every((e) => e.name.startsWith('SYNTH '))).toBe(true);
  });

  it('raises exactly the monitoring rules each loan is labelled with', () => {
    expect(sample.truth.length).toBeGreaterThanOrEqual(4);
    for (const t of sample.truth)
      expect(rulesOf(t.loan_id), `${t.loan_id} ${t.archetype}`).toEqual(
        [...t.expected_rules].sort(),
      );
  });

  it('covers a quiet loan and a loan that trips two rules', () => {
    expect(sample.truth.some((t) => t.expected_rules.length === 0)).toBe(true);
    expect(sample.truth.some((t) => t.expected_rules.length === 2)).toBe(true);
    expect(alerts.length).toBe(2);
  });

  it('names the diversion payee, a linked entity, in its alert', () => {
    const linked = alerts.find((a) => a.ruleId === 'linked_counterparty');
    expect(linked?.title).toMatch(/^Payment to linked entity: SYNTH Related party /);
    expect(linked?.priority).toBe('needs_attention');
  });
});
