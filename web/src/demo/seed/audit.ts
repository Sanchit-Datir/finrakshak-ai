/** Sequential audit entries for the seed; ids depend on call order, so sections run in a fixed order. */

import type { AuditEntry } from '../../domain/schemas.js';

let auditSeq = 0;

/** Restarts audit ids at `au-1` for a new dataset. */
export function resetAuditSeq(): void {
  auditSeq = 0;
}

export function audit(at: string, actor: string, action: string, detail: string): AuditEntry {
  auditSeq += 1;
  return { id: `au-${auditSeq}`, at, actor, action, detail };
}
