/** Extracted document fields: review, manual entry and reset. */

import type { ExtractedField, FieldState } from '../../domain/schemas.js';
import { FIELD_STATE_LABEL } from '../../domain/labels.js';
import { mutate, nowIso, uid } from '../store.js';
import { audit, findDoc } from './internal.js';

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
