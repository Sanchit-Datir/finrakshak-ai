/** Loan applications: draft, save, status, notes, finding review and submission. */

import { newApplicationData } from '../../demo/seed.js';
import type {
  Application,
  ApplicationData,
  ApplicationSection,
  ApplicationStatus,
  BorrowerType,
  FindingStatus,
} from '../../domain/schemas.js';
import { APP_STATUS_LABEL, FINDING_STATUS_LABEL } from '../../domain/labels.js';
import { mutate, nowIso, uid } from '../store.js';
import { audit, findApp } from './internal.js';

/** A blank application that is not stored yet: the form shown before the first save. */
export function unsavedApplication(branchId: string): Application {
  return {
    id: '',
    borrowerId: null,
    borrowerType: 'individual',
    branchId,
    status: 'draft',
    createdAt: '',
    submittedAt: null,
    updatedAt: '',
    createdBy: '',
    step: 1,
    data: newApplicationData(),
    unverifiedSections: [],
    documentIds: [],
    notes: [],
    audit: [],
    checksRunAt: null,
    findingStates: {},
    publicRecords: null,
    aiAnalysis: null,
    aiInvestigation: null,
  };
}

export function createDraftApplication(actor: string, branchId: string): string {
  let id = '';
  mutate((d) => {
    d.counters.application += 1;
    id = `A-${d.counters.application}`;
    const at = nowIso();
    d.applications.push({
      ...unsavedApplication(branchId),
      id,
      createdAt: at,
      updatedAt: at,
      createdBy: actor,
      audit: [audit(actor, 'Application created', 'Draft started')],
    });
  });
  return id;
}

export function saveApplication(
  appId: string,
  actor: string,
  patch: { data?: ApplicationData; borrowerType?: BorrowerType; step?: number; branchId?: string },
  detail = 'Draft saved',
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    if (patch.data !== undefined) a.data = patch.data;
    if (patch.borrowerType !== undefined) a.borrowerType = patch.borrowerType;
    if (patch.step !== undefined) a.step = patch.step;
    if (patch.branchId !== undefined) a.branchId = patch.branchId;
    a.updatedAt = nowIso();
    a.audit.push(audit(actor, 'Saved', detail));
  });
}

export function setStep(appId: string, step: number): void {
  mutate((d) => {
    findApp(d, appId).step = step;
  });
}

export function toggleUnverified(appId: string, actor: string, section: ApplicationSection): void {
  mutate((d) => {
    const a = findApp(d, appId);
    const on = a.unverifiedSections.includes(section);
    a.unverifiedSections = on
      ? a.unverifiedSections.filter((s) => s !== section)
      : [...a.unverifiedSections, section];
    a.audit.push(
      audit(actor, on ? 'Section marked verified' : 'Section marked unverified', section),
    );
  });
}

export function recordChecksRun(appId: string, actor: string, summary: string): void {
  mutate((d) => {
    const a = findApp(d, appId);
    a.checksRunAt = nowIso();
    a.audit.push(audit(actor, 'Checks run', summary));
  });
}

export function setApplicationStatus(
  appId: string,
  actor: string,
  status: ApplicationStatus,
  reason: string,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    const from = a.status;
    a.status = status;
    if (a.submittedAt === null && status !== 'draft') a.submittedAt = nowIso();
    a.updatedAt = nowIso();
    a.audit.push(
      audit(
        actor,
        'Status changed',
        `${APP_STATUS_LABEL[from]} → ${APP_STATUS_LABEL[status]}${reason === '' ? '' : `: ${reason}`}`,
      ),
    );
  });
}

export function addApplicationNote(appId: string, actor: string, text: string): void {
  mutate((d) => {
    const a = findApp(d, appId);
    a.notes.push({ id: uid('n'), author: actor, at: nowIso(), text });
    a.audit.push(audit(actor, 'Note added', text.slice(0, 80)));
  });
}

export function setFindingStatus(
  appId: string,
  findingId: string,
  actor: string,
  status: FindingStatus,
  comment: string,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    const prev = a.findingStates[findingId] ?? { status: 'needs_review' as const, comments: [] };
    const comments =
      comment.trim() === ''
        ? prev.comments
        : [...prev.comments, { id: uid('fc'), author: actor, at: nowIso(), text: comment }];
    a.findingStates[findingId] = { status, comments };
    a.audit.push(
      audit(
        actor,
        'Finding updated',
        `${findingId.split(':')[1] ?? findingId}: ${FINDING_STATUS_LABEL[prev.status]} → ${FINDING_STATUS_LABEL[status]}${comment === '' ? '' : ` — ${comment}`}`,
      ),
    );
  });
}

export function commentOnFinding(
  appId: string,
  findingId: string,
  actor: string,
  text: string,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    const prev = a.findingStates[findingId] ?? { status: 'needs_review' as const, comments: [] };
    a.findingStates[findingId] = {
      ...prev,
      comments: [...prev.comments, { id: uid('fc'), author: actor, at: nowIso(), text }],
    };
  });
}

/** Submits for human review; creates a borrower record on first submission. Never approves or declines. */
export function submitApplication(appId: string, actor: string): void {
  mutate((d) => {
    const a = findApp(d, appId);
    if (a.borrowerId === null) {
      const n = d.borrowers.length + 1;
      const borrowerId = `b-new-${appId.toLowerCase()}`;
      const entityId = `e-new-${appId.toLowerCase()}`;
      const name = a.data.business.businessName || a.data.applicant.fullName || `Applicant ${n}`;
      const at = nowIso();
      d.entities.push({
        id: entityId,
        kind: BUSINESS.has(a.borrowerType) ? 'company' : 'individual',
        name,
        subtitle: `Created from ${appId}`,
        ownerId: null,
        borrowerId,
      });
      d.borrowers.push({
        id: borrowerId,
        entityId,
        name,
        nameOriginal: a.data.applicant.nameOriginal,
        type: a.borrowerType,
        branchId: a.branchId,
        relationshipManager: actor,
        status: 'active',
        maskedIdentifier: 'Not recorded',
        registrationNo: a.data.business.registrationNo,
        createdAt: at,
        updatedAt: at,
      });
      a.borrowerId = borrowerId;
      for (const doc of d.documents) if (doc.applicationId === appId) doc.borrowerId = borrowerId;
      a.audit.push(audit(actor, 'Borrower record created', `${borrowerId} — ${name}`));
    }
    const from = a.status;
    a.status = 'needs_review';
    a.submittedAt ??= nowIso();
    a.updatedAt = nowIso();
    a.step = 4;
    a.audit.push(
      audit(
        actor,
        'Submitted for review',
        `${APP_STATUS_LABEL[from]} → ${APP_STATUS_LABEL.needs_review}`,
      ),
    );
  });
}

const BUSINESS: ReadonlySet<string> = new Set(['proprietorship', 'partnership', 'private_limited']);
