/** Reading reviewed document fields and building evidence references for findings. */

import type { ExtractedField, FtDocument } from '../../domain/schemas.js';
import { docTypeLabel } from '../doc-catalog.js';
import type { EvidenceRef } from './types.js';

interface DocField {
  doc: FtDocument;
  field: ExtractedField;
}

export function fieldsOf(docs: FtDocument[], key: string): DocField[] {
  return docs.flatMap((doc) =>
    doc.fields
      .filter((f) => f.key === key && f.value.trim() !== '')
      .map((field) => ({ doc, field })),
  );
}

export function ref(df: DocField): EvidenceRef {
  return {
    label: `${docTypeLabel(df.doc.docType)} · ${df.doc.filename} · page ${df.field.page + 1} · ${df.field.label}`,
    value: df.field.value,
    docId: df.doc.id,
    fieldId: df.field.id,
    appId: df.doc.applicationId,
  };
}

export function formRef(appId: string, label: string, value: string): EvidenceRef {
  return { label: `Application form · ${label}`, value, docId: null, fieldId: null, appId };
}

export function certaintyFor(dfs: DocField[]): string {
  const unreviewed = dfs.some((d) => d.field.state === 'unreviewed');
  const handwritten = dfs.some(
    (d) => d.field.quality === 'handwritten' || d.field.quality === 'low',
  );
  const simulated = dfs.some((d) => d.field.origin === 'simulated');
  const parts = [
    unreviewed
      ? 'Uses machine-extracted values not yet confirmed by a reviewer.'
      : 'Uses values confirmed or entered by a reviewer.',
  ];
  if (handwritten) parts.push('Includes handwritten text, which is read with lower confidence.');
  if (simulated) parts.push('Extracted values are simulated output.');
  return parts.join(' ');
}

export const PERSON_DOCS = new Set([
  'aadhaar',
  'pan',
  'voter_id',
  'passport',
  'satbara',
  'application_form',
]);

export const COMPANY_ONLY_DOCS: Record<string, string[]> = {
  board_resolution: ['private_limited'],
  company_registration: ['private_limited'],
  partnership_deed: ['partnership'],
};
