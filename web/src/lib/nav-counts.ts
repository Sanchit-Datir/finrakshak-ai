import { PRIORITY_RANK } from '../domain/labels.js';
import type { Db, Priority } from '../domain/schemas.js';
import { allAlerts, isOpen } from './alerts.js';
import { reviewPriority } from './checks.js';
import { collectWork, isOpenCase, topPriority } from './queue.js';

/**
 * Live counts for the sidebar, the mobile tab bar and the dashboard. One module so every place
 * shows the same number for the same thing.
 */

/** Applications still in the review pipeline (same set the dashboard calls "awaiting review"). */
export const AWAITING_REVIEW: ReadonlySet<string> = new Set([
  'documents_needed',
  'processing',
  'needs_review',
  'ready_for_decision',
]);

export interface Count {
  value: number;
  /** Highest priority among the counted items; sets the badge colour (always shown with text). */
  top: Priority | null;
}

export type CountKey = 'queue' | 'alerts' | 'applications' | 'loans' | 'publicNew' | 'cases';

export interface LoanBookPulse {
  total: number;
  /** Loans by the highest priority of their open alerts; loans with none count as routine. */
  byPriority: Record<Priority, number>;
}

export interface NavCounts extends Record<CountKey, Count> {
  pulse: LoanBookPulse;
  /** Urgent open alerts in branches outside the current scope (never hide them silently). */
  urgentElsewhere: number;
}

const count = (priorities: readonly (Priority | null)[]): Count => ({
  value: priorities.length,
  top: topPriority(priorities),
});

const cache = new WeakMap<Db, Map<string, NavCounts>>();

function loanPulse(db: Db, scope: string, open: ReturnType<typeof allAlerts>): LoanBookPulse {
  const loans = db.loans.filter((l) => scope === 'all' || l.branchId === scope);
  const byPriority: Record<Priority, number> = { routine: 0, needs_attention: 0, urgent: 0 };
  for (const loan of loans) {
    const p = topPriority(open.filter((a) => a.loanId === loan.id).map((a) => a.priority));
    byPriority[p ?? 'routine'] += 1;
  }
  return { total: loans.length, byPriority };
}

function compute(db: Db, me: string, scope: string): NavCounts {
  const keep = (branchId: string): boolean => scope === 'all' || branchId === scope;
  const everyOpen = allAlerts(db).filter((a) => isOpen(a.status));
  const open = everyOpen.filter((a) => keep(a.branchId));
  const apps = db.applications.filter((a) => keep(a.branchId));
  const cases = db.cases.filter((c) => keep(c.branchId));
  const awaiting = apps.filter((a) => AWAITING_REVIEW.has(a.status));
  const flaggedLoans = new Map<string, Priority>();
  for (const a of open) {
    if (a.loanId === null) continue;
    const prev = flaggedLoans.get(a.loanId);
    if (prev === undefined || PRIORITY_RANK[a.priority] > PRIORITY_RANK[prev])
      flaggedLoans.set(a.loanId, a.priority);
  }
  return {
    queue: count(collectWork(db, me, open, apps, cases).map((w) => w.priority)),
    alerts: count(open.map((a) => a.priority)),
    applications: count(awaiting.map((a) => reviewPriority(a, db))),
    loans: count([...flaggedLoans.values()]),
    publicNew: count(
      open
        .filter((a) => a.source === 'public_records' && a.status === 'new')
        .map((a) => a.priority),
    ),
    cases: count(cases.filter(isOpenCase).map((c) => c.priority)),
    pulse: loanPulse(db, scope, open),
    urgentElsewhere: everyOpen.filter((a) => !keep(a.branchId) && a.priority === 'urgent').length,
  };
}

/** Cached per database snapshot (the store makes a new Db object on every change). */
export function navCounts(db: Db, me: string, scope: string): NavCounts {
  let perDb = cache.get(db);
  if (perDb === undefined) {
    perDb = new Map();
    cache.set(db, perDb);
  }
  const key = `${me}\u0000${scope}`;
  const hit = perDb.get(key);
  if (hit !== undefined) return hit;
  const result = compute(db, me, scope);
  perDb.set(key, result);
  return result;
}
