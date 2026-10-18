/** Identifier reuse across applications: survey numbers and warehouse receipts. */

import type { Application, Priority } from '../../domain/schemas.js';
import { docTypeLabel } from '../doc-catalog.js';
import type { Check, Ctx, Finding } from './types.js';
import { normalizeIdentifier } from './normalize.js';
import { formRef } from './evidence.js';

function duplicateCheck(
  ctx: Ctx,
  opts: {
    ruleId: string;
    formValue: string;
    fieldKey: string;
    appValue: (a: Application) => string;
    label: string;
    urgentAcrossBorrowers: boolean;
  },
): Finding[] {
  const { app, db } = ctx;
  const target = normalizeIdentifier(opts.formValue);
  if (target === '') return [];
  const others = db.applications.filter(
    (a) => a.id !== app.id && normalizeIdentifier(opts.appValue(a)) === target,
  );
  const otherDocs = db.documents.filter(
    (d) =>
      d.applicationId !== app.id &&
      d.fields.some((f) => f.key === opts.fieldKey && normalizeIdentifier(f.value) === target),
  );
  const otherAppIds = [
    ...new Set([
      ...others.map((a) => a.id),
      ...otherDocs.flatMap((d) => (d.applicationId === null ? [] : [d.applicationId])),
    ]),
  ];
  if (otherAppIds.length === 0) return [];
  const otherApps = otherAppIds.flatMap((id) => db.applications.filter((a) => a.id === id));
  const sameBorrower = otherApps.every(
    (a) => a.borrowerId !== null && a.borrowerId === app.borrowerId,
  );
  const live = otherApps.some((a) => a.status !== 'declined');
  const priority: Priority = sameBorrower
    ? 'routine'
    : live && opts.urgentAcrossBorrowers
      ? 'urgent'
      : 'needs_attention';
  return [
    {
      id: `${app.id}:${opts.ruleId}`,
      ruleId: opts.ruleId,
      title: sameBorrower
        ? `${opts.label} also used in this borrower's earlier application`
        : `${opts.label} ${opts.formValue} appears in another borrower's application`,
      category: 'duplicate_identifier',
      priority,
      certainty: 'Exact match after normalising digits and spacing.',
      observed: `${opts.label} "${opts.formValue}" is also recorded in ${otherApps.map((a) => `${a.id} (${a.status.replace(/_/g, ' ')})`).join(', ')}.`,
      whyItMatters: sameBorrower
        ? 'Usually a legitimate overlap (renewal or re-application); listed for completeness.'
        : 'The same collateral pledged by different parties may indicate double financing or a data-entry error.',
      evidence: [
        formRef(app.id, opts.label, opts.formValue),
        ...otherApps.map((a) => ({
          label: `Application ${a.id} · ${opts.label}`,
          value: opts.appValue(a) || opts.formValue,
          docId: null,
          fieldId: null,
          appId: a.id,
        })),
        ...otherDocs.map((d) => ({
          label: `${docTypeLabel(d.docType)} · ${d.filename}`,
          value: opts.formValue,
          docId: d.id,
          fieldId: d.fields.find((f) => f.key === opts.fieldKey)?.id ?? null,
          appId: d.applicationId,
        })),
      ],
      known: ['The identifier string matches exactly.'],
      unknown: [
        'Whether the earlier pledge has been released.',
        'Whether the documents are genuine — reading text does not establish authenticity.',
      ],
      benign: sameBorrower
        ? ['Renewals and re-applications reuse the same collateral.']
        : [
            'A previous pledge may have been released and the receipt re-issued.',
            'A typing error may have produced the same number.',
          ],
      steps: sameBorrower
        ? ['Confirm the earlier application is closed or declined.']
        : [
            'Confirm the receipt / land record status with the issuing authority.',
            'Check lien marking on the earlier loan.',
            'Hold the application until confirmed.',
          ],
    },
  ];
}

export const duplicateSurvey: Check = (ctx) =>
  duplicateCheck(ctx, {
    ruleId: 'duplicate_survey',
    formValue: ctx.app.data.collateral.surveyNumber,
    fieldKey: 'survey_number',
    appValue: (a) => a.data.collateral.surveyNumber,
    label: 'Survey / Gat number',
    urgentAcrossBorrowers: false,
  });

export const duplicateReceipt: Check = (ctx) =>
  duplicateCheck(ctx, {
    ruleId: 'duplicate_receipt',
    formValue: ctx.app.data.collateral.warehouseReceiptNo,
    fieldKey: 'receipt_number',
    appValue: (a) => a.data.collateral.warehouseReceiptNo,
    label: 'Warehouse receipt',
    urgentAcrossBorrowers: true,
  });
