/** The side-by-side cross-check table shown on the review step. */

import type { Application, Db } from '../../domain/schemas.js';
import { parseAreaToHectares } from '../land.js';
import type { CrossCheck } from './types.js';
import { applicationDocs } from './run.js';
import { fieldsOf } from './evidence.js';
import { compareNames, normalizeDate, normalizeIdentifier } from './normalize.js';

export function crossChecks(app: Application, db: Db): CrossCheck[] {
  const docs = applicationDocs(app, db);
  const rows: CrossCheck[] = [];
  const d = app.data;
  for (const df of fieldsOf(docs, 'applicant_name_latin')) {
    const v = compareNames(d.applicant.fullName, df.field.value);
    rows.push({
      label: 'Name',
      formValue: d.applicant.fullName || '—',
      docValue: df.field.value,
      docId: df.doc.id,
      fieldId: df.field.id,
      verdict: v === 'mismatch' ? 'conflict' : v,
      note: v === 'variation' ? 'Initial or minor spelling variant' : '',
    });
  }
  for (const df of fieldsOf(docs, 'dob')) {
    const a = normalizeDate(d.applicant.dob);
    const b = normalizeDate(df.field.value);
    rows.push({
      label: 'Date of birth',
      formValue: d.applicant.dob || '—',
      docValue: df.field.value,
      docId: df.doc.id,
      fieldId: df.field.id,
      verdict: a === null || b === null ? 'not_available' : a === b ? 'match' : 'conflict',
      note: b !== df.field.value && b !== null ? `Read as ${b}` : '',
    });
  }
  for (const df of fieldsOf(docs, 'survey_number')) {
    const same =
      normalizeIdentifier(d.collateral.surveyNumber) === normalizeIdentifier(df.field.value);
    rows.push({
      label: 'Survey / Gat number',
      formValue: d.collateral.surveyNumber || '—',
      docValue: df.field.value,
      docId: df.doc.id,
      fieldId: df.field.id,
      verdict: d.collateral.surveyNumber === '' ? 'not_available' : same ? 'match' : 'conflict',
      note:
        same && d.collateral.surveyNumber !== df.field.value
          ? 'Same after normalising Devanagari digits'
          : '',
    });
  }
  for (const df of fieldsOf(docs, 'land_area')) {
    const a = parseAreaToHectares(d.collateral.landArea, d.collateral.landUnit);
    const b = parseAreaToHectares(df.field.value, 'hectare');
    const tol = db.settings.monitoring.landAreaTolerancePercent / 100;
    rows.push({
      label: 'Land area',
      formValue:
        d.collateral.landArea === '' ? '—' : `${d.collateral.landArea} ${d.collateral.landUnit}`,
      docValue: df.field.value,
      docId: df.doc.id,
      fieldId: df.field.id,
      verdict:
        a === null || b === null
          ? 'not_available'
          : Math.abs(a - b) <= Math.max(a, b) * tol
            ? 'match'
            : 'conflict',
      note: b === null ? 'Could not parse unit — confirm manually' : `${b.toFixed(2)} ha`,
    });
  }
  for (const df of fieldsOf(docs, 'receipt_number')) {
    const same =
      normalizeIdentifier(d.collateral.warehouseReceiptNo) === normalizeIdentifier(df.field.value);
    rows.push({
      label: 'Warehouse receipt',
      formValue: d.collateral.warehouseReceiptNo || '—',
      docValue: df.field.value,
      docId: df.doc.id,
      fieldId: df.field.id,
      verdict: same ? 'match' : 'conflict',
      note: '',
    });
  }
  return rows;
}
