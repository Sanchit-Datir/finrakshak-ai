import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import { runMonitoring } from './monitoring.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const alerts = runMonitoring(db);
const byLoan = (loanId: string): string[] =>
  alerts
    .filter((a) => a.loanId === loanId)
    .map((a) => a.ruleId)
    .sort();

describe('monitoring rules on demo ledger', () => {
  it('flags rapid onward transfer for the tractor loan (benign case seeded)', () => {
    expect(byLoan('L-2026-0108')).toEqual(['rapid_onward']);
  });
  it('flags circular, linked-counterparty, rapid and repeated patterns for L-2026-0110', () => {
    expect(byLoan('L-2026-0110')).toEqual([
      'circular',
      'linked_counterparty',
      'rapid_onward',
      'repeated_counterparty',
    ]);
  });
  it('flags repeated counterparty only for L-2026-0111', () => {
    expect(byLoan('L-2026-0111')).toEqual(['repeated_counterparty']);
  });
  it('flags split cash withdrawals for L-2026-0112', () => {
    expect(byLoan('L-2026-0112')).toEqual(['cash_split']);
  });
  it('raises nothing for ordinary KCC spending or loans without data', () => {
    expect(byLoan('L-2026-0091')).toEqual([]);
    expect(byLoan('L-2026-0109')).toEqual([]);
  });
  it('responds to configuration changes', () => {
    const strict = {
      ...db,
      settings: {
        ...db.settings,
        monitoring: { ...db.settings.monitoring, rapidOnwardPercent: 99 },
      },
    };
    expect(runMonitoring(strict).some((a) => a.ruleId === 'rapid_onward')).toBe(false);
  });
  it('circular alert totals and transactions are traceable', () => {
    const c = alerts.find((a) => a.ruleId === 'circular');
    expect(c?.transactionIds).toEqual(['T-5007', 'T-5008', 'T-5009']);
    expect(c?.totalMinor).toBe(40_000_000);
  });
});
