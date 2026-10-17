import { newApplicationData } from '../demo/seed.js';
import { getSample } from '../demo/samples.js';
import type {
  AlertStatus,
  Application,
  ApplicationData,
  ApplicationSection,
  ApplicationStatus,
  AuditEntry,
  BorrowerType,
  CaseStatus,
  Db,
  ExtractedField,
  FieldState,
  FindingStatus,
  FtDocument,
  Language,
  Priority,
  PrSubject,
  PublicRecordsSnapshot,
  PublicWatch,
  Transaction,
  WatchEvent,
} from '../domain/schemas.js';
import {
  APP_STATUS_LABEL,
  ALERT_STATUS_LABEL,
  CASE_STATUS_LABEL,
  FIELD_STATE_LABEL,
  FINDING_STATUS_LABEL,
} from '../domain/labels.js';
import { releaseFile } from './files.js';
import { mutate, nowIso, uid } from './store.js';

/** All state changes go through here so every change leaves an audit entry. */

function audit(actor: string, action: string, detail: string): AuditEntry {
  return { id: uid('au'), at: nowIso(), actor, action, detail };
}

function findApp(d: Db, id: string): Application {
  const a = d.applications.find((x) => x.id === id);
  if (a === undefined) throw new Error(`Application ${id} not found`);
  return a;
}

function findDoc(d: Db, id: string): FtDocument {
  const doc = d.documents.find((x) => x.id === id);
  if (doc === undefined) throw new Error(`Document ${id} not found`);
  return doc;
}

// ---------- applications ----------

export function createDraftApplication(actor: string, branchId: string): string {
  let id = '';
  mutate((d) => {
    d.counters.application += 1;
    id = `A-${d.counters.application}`;
    const at = nowIso();
    d.applications.push({
      id,
      borrowerId: null,
      borrowerType: 'individual',
      branchId,
      status: 'draft',
      createdAt: at,
      submittedAt: null,
      updatedAt: at,
      createdBy: actor,
      step: 1,
      data: newApplicationData(),
      unverifiedSections: [],
      documentIds: [],
      notes: [],
      audit: [audit(actor, 'Application created', 'Draft started')],
      checksRunAt: null,
      findingStates: {},
      publicRecords: null,
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

/** Saves the facts a public-records check found, so findings are reproducible and audited. */
export function recordPublicRecordsCheck(
  appId: string,
  actor: string,
  snapshot: PublicRecordsSnapshot,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    a.publicRecords = snapshot;
    const found = snapshot.exposures.length;
    a.audit.push(
      audit(
        actor,
        'Public-records check run',
        `Local dataset built ${snapshot.datasetBuiltAt?.slice(0, 10) ?? 'unknown'}; ` +
          `${snapshot.customersChecked.length} customer(s) checked; ` +
          `${found} customer(s) in insolvency or liquidation`,
      ),
    );
  });
}

export type NewWatch = Pick<
  PublicWatch,
  'loanRef' | 'borrowerName' | 'cin' | 'amountMinor' | 'disbursedOn' | 'branchId'
>;

/** Adds a disbursed loan's borrower to the public-records watch. Returns the watch id. */
export function addPublicWatch(actor: string, input: NewWatch): string {
  let id = '';
  mutate((d) => {
    id = `W-${d.publicWatches.length + 1}`;
    const at = nowIso();
    d.publicWatches.push({
      ...input,
      id,
      loanId: null,
      createdAt: at,
      createdBy: actor,
      lastCheck: null,
      events: [],
      audit: [audit(actor, 'Watch added', `${input.loanRef}, disbursed ${input.disbursedOn}`)],
    });
  });
  return id;
}

/**
 * Makes sure every disbursed loan in the loan book has a watch (idempotent). Watches are
 * created from the loan and its borrower: no data entry. Returns how many were added.
 */
export function syncLoanWatches(actor: string): number {
  let added = 0;
  mutate((d) => {
    const watched = new Set(d.publicWatches.map((w) => w.loanId));
    for (const loan of d.loans) {
      if (watched.has(loan.id)) continue;
      const b = d.borrowers.find((x) => x.id === loan.borrowerId);
      if (b === undefined) continue;
      added += 1;
      d.publicWatches.push({
        id: `W-${d.publicWatches.length + 1}`,
        loanId: loan.id,
        loanRef: loan.id,
        borrowerName: b.name,
        cin: b.registrationNo,
        amountMinor: loan.amountMinor,
        disbursedOn: loan.disbursedAt.slice(0, 10),
        branchId: loan.branchId,
        createdAt: nowIso(),
        createdBy: actor,
        lastCheck: null,
        events: [],
        audit: [audit(actor, 'Watch added automatically', `From the loan book (${loan.id})`)],
      });
    }
  });
  return added;
}

/** Saves a watch check; new events are appended (never edited or removed). */
export function recordWatchCheck(
  watchId: string,
  actor: string,
  result: {
    asOf: string;
    subject: PrSubject;
    newEvents: WatchEvent[];
    datasetBuiltAt: string | null;
  },
): void {
  mutate((d) => {
    const w = d.publicWatches.find((x) => x.id === watchId);
    if (w === undefined) throw new Error(`Watch ${watchId} not found`);
    const checkedAt = nowIso();
    w.lastCheck = {
      checkedAt,
      asOf: result.asOf,
      datasetBuiltAt: result.datasetBuiltAt,
      subject: result.subject,
    };
    w.events.push(...result.newEvents);
    w.audit.push(
      audit(
        actor,
        'Watch checked',
        `As of ${result.asOf}: ${result.newEvents.length} new public record(s)`,
      ),
    );
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

// ---------- documents ----------

function newDocId(d: Db): string {
  d.counters.document += 1;
  return `D-${String(d.counters.document).padStart(4, '0')}`;
}

/** Attaches a synthetic sample. Its fields are labelled simulated output and start unreviewed. */
export function attachSample(appId: string, sampleId: string, actor: string): string | null {
  const sample = getSample(sampleId);
  if (sample === undefined) return null;
  let id = '';
  mutate((d) => {
    const a = findApp(d, appId);
    id = newDocId(d);
    const at = nowIso();
    d.documents.push({
      id,
      applicationId: appId,
      borrowerId: a.borrowerId,
      filename: `${sample.id}.jpg`,
      docType: sample.docType,
      language: sample.language,
      source: 'demo',
      mimeType: 'image/jpeg',
      sizeBytes: 240_000,
      pages: [{ index: 0, rotation: 0 }],
      uploadedBy: actor,
      uploadedAt: at,
      processing: 'needs_review',
      failureReason: null,
      qualityWarnings: sample.qualityWarnings,
      sampleId: sample.id,
      fields: sample.fields.map((f, i) => ({
        id: `${id}-f${i}`,
        key: f.key,
        label: f.label,
        machineValue: f.value,
        value: f.value,
        origin: 'simulated',
        page: 0,
        region: f.region,
        quality: f.quality,
        state: f.quality === 'unreadable' ? 'unclear' : 'unreviewed',
        reviewedBy: null,
        reviewedAt: null,
      })),
      audit: [
        audit(
          actor,
          'Sample attached',
          `${sample.title} (synthetic). Fields are simulated demo output.`,
        ),
      ],
    });
    a.documentIds.push(id);
    a.updatedAt = at;
    a.audit.push(audit(actor, 'Document attached', `${id} — ${sample.title} (demo sample)`));
  });
  return id;
}

export function addUploadedDocument(
  appId: string | null,
  file: File,
  source: 'upload' | 'camera',
  actor: string,
): string {
  let id = '';
  mutate((d) => {
    id = newDocId(d);
    const app = appId === null ? undefined : findApp(d, appId);
    d.documents.push({
      id,
      applicationId: appId,
      borrowerId: app?.borrowerId ?? null,
      filename: file.name,
      docType: null,
      language: null,
      source,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      pages: [{ index: 0, rotation: 0 }],
      uploadedBy: actor,
      uploadedAt: nowIso(),
      processing: 'uploading',
      failureReason: null,
      qualityWarnings: [],
      sampleId: null,
      fields: [],
      audit: [
        audit(
          actor,
          source === 'camera' ? 'Captured with camera' : 'File selected',
          `${file.name} (${file.type || 'unknown type'})`,
        ),
      ],
    });
    if (app !== undefined) {
      app.documentIds.push(id);
      app.audit.push(audit(actor, 'Document attached', `${id} — ${file.name}`));
    }
  });
  return id;
}

export function updateDocument(
  docId: string,
  patch: Partial<
    Pick<
      FtDocument,
      'processing' | 'failureReason' | 'qualityWarnings' | 'pages' | 'docType' | 'language'
    >
  >,
  actor?: string,
  detail?: string,
): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    Object.assign(doc, patch);
    if (actor !== undefined && detail !== undefined)
      doc.audit.push(audit(actor, 'Updated', detail));
  });
}

export function setDocType(docId: string, docType: string | null, actor: string): void {
  updateDocument(docId, { docType }, actor, `Document type set to ${docType ?? 'not classified'}`);
}

export function setDocLanguage(docId: string, language: Language | null, actor: string): void {
  updateDocument(docId, { language }, actor, `Language set manually to ${language ?? 'not set'}`);
}

export function rotatePage(docId: string, pageIndex: number, actor: string): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    const page = doc.pages[pageIndex];
    if (page === undefined) return;
    page.rotation = ((page.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    doc.audit.push(audit(actor, 'Page rotated', `Page ${pageIndex + 1} → ${page.rotation}°`));
  });
}

export function moveDocument(appId: string, docId: string, dir: -1 | 1): void {
  mutate((d) => {
    const a = findApp(d, appId);
    const i = a.documentIds.indexOf(docId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= a.documentIds.length) return;
    const ids = [...a.documentIds];
    [ids[i], ids[j]] = [ids[j] ?? docId, ids[i] ?? docId];
    a.documentIds = ids;
  });
}

/** Removes a document and its local file. Callers must confirm with the user first. */
export function removeDocument(docId: string, actor: string): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    for (const a of d.applications) {
      if (a.documentIds.includes(docId)) {
        a.documentIds = a.documentIds.filter((x) => x !== docId);
        a.audit.push(audit(actor, 'Document removed', `${docId} — ${doc.filename}`));
      }
    }
    d.documents = d.documents.filter((x) => x.id !== docId);
  });
  releaseFile(docId);
}

export function linkDocument(docId: string, appId: string, actor: string): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    for (const a of d.applications) a.documentIds = a.documentIds.filter((x) => x !== docId);
    const app = findApp(d, appId);
    app.documentIds.push(docId);
    app.audit.push(audit(actor, 'Document linked', `${docId} — ${doc.filename}`));
    doc.applicationId = appId;
    doc.borrowerId = app.borrowerId;
    doc.audit.push(audit(actor, 'Linked', `Linked to ${appId}`));
  });
}

// ---------- extracted fields ----------

export function reviewField(
  docId: string,
  fieldId: string,
  actor: string,
  next: { state: FieldState; value?: string },
): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    const f = doc.fields.find((x) => x.id === fieldId);
    if (f === undefined) return;
    const before = f.value;
    let state = next.state;
    if (next.value !== undefined && next.value !== f.value) {
      f.value = next.value;
      // A changed machine value is a correction; manual fields stay "confirmed".
      state = f.origin === 'manual' ? 'confirmed' : 'corrected';
    }
    if (state === 'confirmed' && f.machineValue !== null && f.value !== f.machineValue)
      state = 'corrected';
    f.state = state;
    f.reviewedBy = actor;
    f.reviewedAt = nowIso();
    const change = before === f.value ? '' : ` ("${before}" → "${f.value}")`;
    doc.audit.push(
      audit(actor, 'Field reviewed', `${f.label}: ${FIELD_STATE_LABEL[state]}${change}`),
    );
    if (doc.fields.every((x) => x.state !== 'unreviewed') && doc.processing === 'needs_review')
      doc.processing = 'completed';
  });
}

export function addManualField(
  docId: string,
  actor: string,
  key: string,
  label: string,
  value: string,
  page: number,
): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    const field: ExtractedField = {
      id: uid(`${docId}-m`),
      key,
      label,
      machineValue: null,
      value,
      origin: 'manual',
      page,
      region: null,
      quality: 'not_applicable',
      state: value.trim() === '' ? 'unclear' : 'confirmed',
      reviewedBy: actor,
      reviewedAt: nowIso(),
    };
    doc.fields.push(field);
    doc.audit.push(audit(actor, 'Manual entry', `${label} = "${value}"`));
  });
}

export function resetField(docId: string, fieldId: string, actor: string): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    const f = doc.fields.find((x) => x.id === fieldId);
    if (f === undefined || f.machineValue === null) return;
    f.value = f.machineValue;
    f.state = 'unreviewed';
    f.reviewedBy = null;
    f.reviewedAt = null;
    doc.audit.push(audit(actor, 'Field reset', `${f.label} restored to machine-extracted value`));
  });
}

// ---------- alerts ----------

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

// ---------- cases ----------

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

function findCase(d: Db, id: string): Db['cases'][number] {
  const c = d.cases.find((x) => x.id === id);
  if (c === undefined) throw new Error(`Case ${id} not found`);
  return c;
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

// ---------- transactions ----------

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

/** Swaps the underlying file; previously entered fields are kept but sent back for review. */
export function replaceDocumentFile(docId: string, file: File, actor: string): void {
  mutate((d) => {
    const doc = findDoc(d, docId);
    const old = doc.filename;
    doc.filename = file.name;
    doc.mimeType = file.type || 'application/octet-stream';
    doc.sizeBytes = file.size;
    doc.source = 'upload';
    doc.sampleId = null;
    doc.processing = 'uploading';
    doc.failureReason = null;
    doc.qualityWarnings = [];
    doc.pages = [{ index: 0, rotation: 0 }];
    for (const f of doc.fields) {
      f.state = 'unreviewed';
      f.region = null;
      f.reviewedBy = null;
      f.reviewedAt = null;
    }
    doc.audit.push(
      audit(actor, 'File replaced', `${old} → ${file.name}; existing fields returned for review`),
    );
  });
}

/** Demo documents have no file to reprocess; retry routes them to manual entry. */
export function retryWithoutFile(docId: string, actor: string): void {
  updateDocument(
    docId,
    {
      processing: 'needs_review',
      failureReason: null,
      qualityWarnings: [
        'No file is available to reprocess. Retake the photo, re-upload, or enter fields manually.',
      ],
    },
    actor,
    'Retry: routed to manual entry',
  );
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
