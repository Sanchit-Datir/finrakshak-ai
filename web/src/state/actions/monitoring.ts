/** Loan monitoring: alert triage and transaction import. */

import type { AlertStatus, Db, Transaction } from '../../domain/schemas.js';
import { ALERT_STATUS_LABEL } from '../../domain/labels.js';
import { mutate, nowIso, uid } from '../store.js';
import { audit } from './internal.js';

export function updateAlert(
  alertId: string,
  actor: string,
  patch: {
    status?: AlertStatus;
    note?: string;
    assignee?: string | null;
    resolutionReason?: string;
  },
): void {
  mutate((d) => {
    const prev = d.alertStates[alertId] ?? {
      status: 'new' as const,
      assignee: null,
      resolutionReason: null,
      notes: [],
      audit: [],
    };
    const next = { ...prev, notes: [...prev.notes], audit: [...prev.audit] };
    if (patch.status !== undefined && patch.status !== prev.status) {
      next.status = patch.status;
      next.resolutionReason = patch.resolutionReason ?? null;
      next.audit.push(
        audit(
          actor,
          'Status changed',
          `${ALERT_STATUS_LABEL[prev.status]} → ${ALERT_STATUS_LABEL[patch.status]}${patch.resolutionReason === undefined || patch.resolutionReason === '' ? '' : `: ${patch.resolutionReason}`}`,
        ),
      );
    }
    if (patch.assignee !== undefined && patch.assignee !== prev.assignee) {
      next.assignee = patch.assignee;
      next.audit.push(audit(actor, 'Assigned', patch.assignee ?? 'Unassigned'));
    }
    if (patch.note !== undefined && patch.note.trim() !== '') {
      next.notes.push({ id: uid('an'), author: actor, at: nowIso(), text: patch.note });
      next.audit.push(audit(actor, 'Note added', patch.note.slice(0, 80)));
    }
    d.alertStates[alertId] = next;
    if (!d.readAlertIds.includes(alertId)) d.readAlertIds.push(alertId);
  });
}

export function importTransactions(
  rows: Transaction[],
  newEntities: Db['entities'],
  filename: string,
): number {
  let added = 0;
  mutate((d) => {
    const existing = new Set(d.transactions.map((t) => t.id));
    const fresh = rows.filter((r) => !existing.has(r.id));
    added = fresh.length;
    const ids = new Set(d.entities.map((e) => e.id));
    d.entities.push(...newEntities.filter((e) => !ids.has(e.id)));
    d.transactions.push(...fresh);
    const loanIds = new Set(fresh.map((r) => r.loanId).filter((x): x is string => x !== null));
    for (const l of d.loans) {
      if (loanIds.has(l.id)) {
        l.lastUpdated = nowIso();
        l.dataSource = `Imported file: ${filename}`;
      }
    }
  });
  return added;
}
