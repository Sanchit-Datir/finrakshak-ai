/** Sample documents attached to the demo applications, with simulated extracted fields. */

import type { ExtractedField, FtDocument } from '../../domain/schemas.js';
import { getSample } from '../samples.js';
import { audit } from './audit.js';
import type { SeedContext } from './context.js';

export interface NewDocument {
  appId: string;
  borrowerId: string;
  docType: string;
  filename: string;
  days: number;
  sampleId?: string;
  state?: ExtractedField['state'];
  processing?: FtDocument['processing'];
  language?: FtDocument['language'];
  failure?: string;
  warnings?: string[];
  fields?: ExtractedField[];
}

export interface DocumentBook {
  readonly docs: FtDocument[];
  /** Adds a document and returns its id (`D-0001`, `D-0002`, … in call order). */
  readonly addDoc: (o: NewDocument) => string;
  /** How many documents were added so far. */
  readonly count: () => number;
}

const fieldsFrom = (
  sampleId: string,
  docId: string,
  state: ExtractedField['state'],
  reviewer: string | null,
  at: string,
): ExtractedField[] => {
  const s = getSample(sampleId);
  if (s === undefined) return [];
  return s.fields.map((f, i) => ({
    id: `${docId}-f${i}`,
    key: f.key,
    label: f.label,
    machineValue: f.value,
    value: f.value,
    origin: 'simulated',
    page: 0,
    region: f.region,
    quality: f.quality,
    state: f.quality === 'unreadable' ? 'unclear' : state,
    reviewedBy: state === 'unreviewed' && f.quality !== 'unreadable' ? null : reviewer,
    reviewedAt: state === 'unreviewed' && f.quality !== 'unreadable' ? null : at,
  }));
};

export function createDocumentBook(ctx: SeedContext): DocumentBook {
  const { ago, plus, officer } = ctx;
  let docSeq = 0;
  const docs: FtDocument[] = [];
  const addDoc = (o: NewDocument): string => {
    docSeq += 1;
    const id = `D-${String(docSeq).padStart(4, '0')}`;
    const at = ago(o.days, 10);
    const sample = o.sampleId === undefined ? undefined : getSample(o.sampleId);
    const state = o.state ?? 'confirmed';
    const fields =
      o.fields ??
      (sample === undefined
        ? []
        : fieldsFrom(sample.id, id, state, state === 'unreviewed' ? null : officer, plus(at, 2)));
    docs.push({
      id,
      applicationId: o.appId,
      borrowerId: o.borrowerId,
      filename: o.filename,
      docType: o.docType,
      language: o.language ?? sample?.language ?? 'en',
      source: 'demo',
      mimeType: o.filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
      sizeBytes: 180_000 + docSeq * 7_919,
      pages: [{ index: 0, rotation: 0 }],
      uploadedBy: officer,
      uploadedAt: at,
      processing: o.processing ?? (state === 'unreviewed' ? 'needs_review' : 'completed'),
      failureReason: o.failure ?? null,
      qualityWarnings: o.warnings ?? sample?.qualityWarnings ?? [],
      sampleId: sample?.id ?? null,
      fields,
      audit: [audit(at, officer, 'Uploaded', `${o.filename} added (sample records)`)],
    });
    return id;
  };
  return { docs, addDoc, count: () => docSeq };
}
