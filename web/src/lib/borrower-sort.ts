import type { Priority } from '../domain/schemas.js';

const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, needs_attention: 2, routine: 1 };

/**
 * Sort key for the borrowers list: most open findings first; equal counts are
 * ordered Urgent review → Needs attention → Routine review → no priority.
 */
export function findingsSortValue(s: { openFindings: number; priority: Priority | null }): number {
  return s.openFindings * 10 + (s.priority === null ? 0 : PRIORITY_RANK[s.priority]);
}
