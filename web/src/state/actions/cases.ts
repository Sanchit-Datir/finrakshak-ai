/** Investigation cases: creation, status, assignment, notes, tasks and evidence. */

import type { CaseStatus, Db, Priority } from '../../domain/schemas.js';
import { CASE_STATUS_LABEL } from '../../domain/labels.js';
import { mutate, nowIso, uid } from '../store.js';
import { audit, findCase } from './internal.js';

export function createCase(
  actor: string,
  input: {
    title: string;
    summary: string;
    priority: Priority;
    branchId: string;
    source: 'pre_disbursement' | 'monitoring' | 'referral';
    borrowerIds: string[];
    entityIds: string[];
    loanIds: string[];
    applicationIds: string[];
    alertIds: string[];
  },
): string {
  let id = '';
  mutate((d) => {
    d.counters.case += 1;
    id = `CASE-${new Date().getFullYear()}-${String(d.counters.case).padStart(3, '0')}`;
    const at = nowIso();
    d.cases.push({
      id,
      ...input,
      status: 'new',
      owner: actor,
      openedAt: at,
      updatedAt: at,
      evidence: [],
      notes: [],
      checklist: [],
      audit: [
        audit(
          actor,
          'Case opened',
          input.alertIds.length > 0
            ? `From alert(s) ${input.alertIds.join(', ')}`
            : 'Opened manually',
        ),
      ],
      outcome: null,
    });
    for (const alertId of input.alertIds) {
      const prev = d.alertStates[alertId] ?? {
        status: 'new' as const,
        assignee: null,
        resolutionReason: null,
        notes: [],
        audit: [],
      };
      d.alertStates[alertId] = {
        ...prev,
        status: 'escalated',
        audit: [...prev.audit, audit(actor, 'Escalated', `Linked to ${id}`)],
      };
    }
  });
  return id;
}

export function setCaseStatus(
  caseId: string,
  actor: string,
  status: CaseStatus,
  reason: string,
  outcome?: string,
): void {
  mutate((d) => {
    const c = findCase(d, caseId);
    const from = c.status;
    c.status = status;
    c.updatedAt = nowIso();
    if (outcome !== undefined) c.outcome = outcome;
    c.audit.push(
      audit(
        actor,
        'Status changed',
        `${CASE_STATUS_LABEL[from]} → ${CASE_STATUS_LABEL[status]}: ${reason}`,
      ),
    );
  });
}

export function assignCase(caseId: string, actor: string, owner: string): void {
  mutate((d) => {
    const c = findCase(d, caseId);
    c.audit.push(audit(actor, 'Reassigned', `${c.owner} → ${owner}`));
    c.owner = owner;
    c.updatedAt = nowIso();
  });
}

export function addCaseNote(caseId: string, actor: string, text: string): void {
  mutate((d) => {
    const c = findCase(d, caseId);
    c.notes.push({ id: uid('cn'), author: actor, at: nowIso(), text });
    c.updatedAt = nowIso();
    c.audit.push(audit(actor, 'Note added', text.slice(0, 80)));
  });
}

export function toggleCaseTask(caseId: string, taskId: string, actor: string): void {
  mutate((d) => {
    const c = findCase(d, caseId);
    const t = c.checklist.find((x) => x.id === taskId);
    if (t === undefined) return;
    t.done = !t.done;
    c.audit.push(audit(actor, t.done ? 'Task completed' : 'Task reopened', t.text));
  });
}

export function addCaseTask(caseId: string, actor: string, text: string): void {
  mutate((d) => {
    const c = findCase(d, caseId);
    c.checklist.push({ id: uid('ck'), text, done: false });
    c.audit.push(audit(actor, 'Task added', text));
  });
}

export function addCaseEvidence(
  caseId: string,
  actor: string,
  ev: Omit<Db['cases'][number]['evidence'][number], 'id' | 'collectedAt'>,
): void {
  mutate((d) => {
    const c = findCase(d, caseId);
    c.evidence.push({ ...ev, id: uid('ev'), collectedAt: nowIso() });
    c.audit.push(audit(actor, 'Evidence added', `${ev.sourceName} — ${ev.reference}`));
  });
}
