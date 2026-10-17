import { describe, expect, it } from 'vitest';
import { createDemoDb, defaultSettings } from '../demo/seed.js';
import golden from './__golden__/monitoring-demo.json';
import { monitoringAlertId, runMonitoring } from './monitoring.js';

/**
 * Characterisation tests (docs/plans/RISK_SCORING_PLAN.md, MVP 0). They record what the monitoring
 * rules do today, so the rule detection can be moved into packages/shared and shown to behave
 * identically. If one of these fails after an intended change, regenerate the golden file on purpose
 * and say so in the commit; if it fails after a refactor, the refactor changed behaviour.
 */

const NOW = new Date('2026-10-15T06:00:00Z');
const db = createDemoDb(NOW);

describe('monitoring rules, whole output on the demo ledger', () => {
  it('matches the recorded alerts exactly (ids, order, priorities, text, totals, traceability)', () => {
    expect(JSON.parse(JSON.stringify(runMonitoring(db)))).toEqual(golden);
  });

  it('keeps the rule order: per loan rapid, linked, circular, cash; repeated-counterparty last', () => {
    expect(runMonitoring(db).map((a) => a.ruleId)).toEqual([
      'rapid_onward',
      'rapid_onward',
      'linked_counterparty',
      'circular',
      'cash_split',
      'repeated_counterparty',
      'repeated_counterparty',
    ]);
  });

  it('assigns priorities: circular is urgent, every other rule needs attention', () => {
    const byRule = new Map(runMonitoring(db).map((a) => [a.ruleId, a.priority]));
    expect(byRule.get('circular')).toBe('urgent');
    for (const rule of [
      'rapid_onward',
      'linked_counterparty',
      'cash_split',
      'repeated_counterparty',
    ])
      expect(byRule.get(rule as 'rapid_onward')).toBe('needs_attention');
  });
});

describe('monitoring alert ids and memoisation', () => {
  it('builds ids as mon:<rule>:<loan>[:<key>]', () => {
    expect(monitoringAlertId('rapid_onward', 'L1')).toBe('mon:rapid_onward:L1');
    expect(monitoringAlertId('circular', 'L1', 'T9')).toBe('mon:circular:L1:T9');
  });

  it('returns the same array for the same Db object and recomputes for a copy', () => {
    const first = runMonitoring(db);
    expect(runMonitoring(db)).toBe(first);
    const copy = { ...db };
    const second = runMonitoring(copy);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('is deterministic: a second demo ledger built for the same instant gives the same alerts', () => {
    expect(runMonitoring(createDemoDb(NOW))).toEqual(runMonitoring(db));
  });
});

describe('default monitoring thresholds', () => {
  it('are the values the rules documentation and the synthetic data plan rely on', () => {
    const m = defaultSettings().monitoring;
    expect({
      rapidOnwardHours: m.rapidOnwardHours,
      rapidOnwardPercent: m.rapidOnwardPercent,
      repeatedCounterpartyMinLoans: m.repeatedCounterpartyMinLoans,
      repeatedCounterpartyWindowDays: m.repeatedCounterpartyWindowDays,
      repeatedCounterpartyMinAmountMinor: m.repeatedCounterpartyMinAmountMinor,
      circularWindowDays: m.circularWindowDays,
      circularMinReturnPercent: m.circularMinReturnPercent,
      cashReferenceMinor: m.cashReferenceMinor,
      cashNearPercent: m.cashNearPercent,
      cashMinCount: m.cashMinCount,
      cashWindowDays: m.cashWindowDays,
    }).toEqual({
      rapidOnwardHours: 72,
      rapidOnwardPercent: 70,
      repeatedCounterpartyMinLoans: 2,
      repeatedCounterpartyWindowDays: 60,
      repeatedCounterpartyMinAmountMinor: 10_000_000,
      circularWindowDays: 30,
      circularMinReturnPercent: 50,
      cashReferenceMinor: 10_000_000,
      cashNearPercent: 90,
      cashMinCount: 3,
      cashWindowDays: 7,
    });
  });
});
