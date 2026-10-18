import { PRIORITY_RANK } from '../domain/labels.js';
import type { Application, Case, Db, Priority } from '../domain/schemas.js';
import { isOpen, type UnifiedAlert } from './alerts.js';
import { reviewPriority } from './checks.js';

/** One thing waiting on the signed-in person: an alert or case they own, or an application to review. */
export interface WorkItem {
  id: string;
  kind: 'Alert' | 'Case' | 'Application';
  title: string;
  detail: string;
  priority: Priority | null;
  at: string;
  href: string;
}

const rank = (p: Priority | null): number => (p === null ? -1 : PRIORITY_RANK[p]);

export function isOpenCase(c: Case): boolean {
  return c.status !== 'resolved' && c.status !== 'closed';
}

/** Most urgent first, then most recent. */
export function byPriorityThenTime(x: WorkItem, y: WorkItem): number {
  return rank(y.priority) - rank(x.priority) || y.at.localeCompare(x.at);
}

/** Highest priority in a list, or null when the list is empty or has no priorities. */
export function topPriority(priorities: readonly (Priority | null)[]): Priority | null {
  return priorities.reduce<Priority | null>((top, p) => (rank(p) > rank(top) ? p : top), null);
}

/** "My queue": the same list on the dashboard card, the queue page and the sidebar count. */
export function collectWork(
  db: Db,
  me: string,
  alerts: readonly UnifiedAlert[],
  apps: readonly Application[],
  cases: readonly Case[],
): WorkItem[] {
  return [
    ...alerts
      .filter((a) => a.assignee === me && isOpen(a.status))
      .map((a) => ({
        id: a.id,
        kind: 'Alert' as const,
        title: a.title,
        detail: a.linkedLabel,
        priority: a.priority,
        at: a.at,
        href: `/alerts?alert=${encodeURIComponent(a.id)}`,
      })),
    ...cases
      .filter((c) => c.owner === me && isOpenCase(c))
      .map((c) => ({
        id: c.id,
        kind: 'Case' as const,
        title: c.title,
        detail: `${c.id} · ${c.status.replace(/_/g, ' ')}`,
        priority: c.priority,
        at: c.updatedAt,
        href: `/investigations/${c.id}`,
      })),
    ...apps
      .filter((a) => a.status === 'needs_review')
      .map((a) => ({
        id: a.id,
        kind: 'Application' as const,
        title: a.data.business.businessName || a.data.applicant.fullName || a.id,
        detail: `${a.id} · needs review`,
        priority: reviewPriority(a, db),
        at: a.updatedAt,
        href: `/applications/${a.id}`,
      })),
  ].sort(byPriorityThenTime);
}
