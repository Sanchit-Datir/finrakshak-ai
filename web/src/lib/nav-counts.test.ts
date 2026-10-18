import { describe, expect, it } from 'vitest';
import { createDemoDb } from '../demo/seed.js';
import { allAlerts, isOpen } from './alerts.js';
import { navCounts } from './nav-counts.js';
import { collectWork } from './queue.js';

const db = createDemoDb(new Date('2026-10-15T06:00:00Z'));
const me = 'Anjali Patil';
const open = allAlerts(db).filter((a) => isOpen(a.status));

describe('navCounts', () => {
  it('counts every open alert across all branches, with the highest priority', () => {
    const c = navCounts(db, me, 'all');
    expect(c.alerts.value).toBe(open.length);
    const top = open.some((a) => a.priority === 'urgent')
      ? 'urgent'
      : open.some((a) => a.priority === 'needs_attention')
        ? 'needs_attention'
        : open.length > 0
          ? 'routine'
          : null;
    expect(c.alerts.top).toBe(top);
    expect(c.urgentElsewhere).toBe(0);
  });

  it('matches My queue exactly', () => {
    const c = navCounts(db, me, 'all');
    expect(c.queue.value).toBe(collectWork(db, me, open, db.applications, db.cases).length);
  });

  it('splits the loan book by priority without losing a loan', () => {
    const { pulse } = navCounts(db, me, 'all');
    const sum = pulse.byPriority.routine + pulse.byPriority.needs_attention + pulse.byPriority.urgent;
    expect(sum).toBe(pulse.total);
    expect(pulse.total).toBe(db.loans.length);
  });

  // B-65: a branch scope never hides urgent work silently.
  it('reports urgent alerts in other branches when scoped to one branch', () => {
    for (const b of db.branches) {
      const c = navCounts(db, me, b.id);
      const elsewhere = open.filter((a) => a.branchId !== b.id && a.priority === 'urgent').length;
      expect(c.urgentElsewhere).toBe(elsewhere);
      expect(c.alerts.value).toBe(open.filter((a) => a.branchId === b.id).length);
    }
  });

  it('returns zero counts, not errors, for an empty database', () => {
    const empty = { ...db, applications: [], loans: [], cases: [], transactions: [] };
    const c = navCounts(empty, me, 'all');
    expect(c.applications).toEqual({ value: 0, top: null });
    expect(c.pulse.total).toBe(0);
  });
});
