/** Documents attached to an application: samples, uploads, type, pages, links and removal. */

import { getSample } from '../../demo/samples.js';
import type { FtDocument, Language } from '../../domain/schemas.js';
import { releaseFile } from '../files.js';
import { mutate, nowIso } from '../store.js';
import { audit, findApp, findDoc, newDocId } from './internal.js';

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
          `${sample.title} (synthetic). Fields are simulated output.`,
        ),
      ],
    });
    a.documentIds.push(id);
    a.updatedAt = at;
    a.audit.push(audit(actor, 'Document attached', `${id} — ${sample.title} (sample)`));
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
