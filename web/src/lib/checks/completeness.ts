/** Completeness rules: required form fields, missing documents and unreviewed items. */

import { docTypeLabel } from '../doc-catalog.js';
import type { Check, Finding } from './types.js';
import { COMPANY_ONLY_DOCS, formRef, ref } from './evidence.js';

export const requiredFields: Check = ({ app }) => {
  const d = app.data;
  const missing = [
    d.applicant.fullName.trim() === '' ? 'Applicant name' : null,
    d.loan.amountMinor === null ? 'Loan amount' : null,
    d.loan.purpose.trim() === '' ? 'Loan purpose' : null,
  ].filter((x): x is string => x !== null);
  if (missing.length === 0) return [];
  return [
    {
      id: `${app.id}:required_fields`,
      ruleId: 'required_fields',
      title: `Required information missing: ${missing.join(', ')}`,
      category: 'evidence_incomplete',
      priority: 'needs_attention',
      certainty: 'Certain — fields are empty on the application form.',
      observed: `The application form has no value for ${missing.join(', ')}.`,
      whyItMatters: 'Checks that depend on these values cannot run.',
      evidence: missing.map((m) => formRef(app.id, m, '(empty)')),
      known: ['The fields are empty in the saved application.'],
      unknown: ['Whether the information exists on paper but has not been entered.'],
      benign: ['Draft applications are often saved before all information is collected.'],
      steps: ['Complete the missing fields in Step 3 (Review application).'],
    },
  ];
};

export const missingDocuments: Check = ({ app, docs, db }) => {
  const required = db.settings.checklists[app.data.loan.product];
  const present = new Set(docs.filter((d) => d.processing !== 'failed').map((d) => d.docType));
  const missing = required.filter((t) => {
    const only = COMPANY_ONLY_DOCS[t];
    if (only !== undefined && !only.includes(app.borrowerType)) return false;
    return !present.has(t);
  });
  if (missing.length === 0) return [];
  const labels = missing.map(docTypeLabel);
  return [
    {
      id: `${app.id}:missing_documents`,
      ruleId: 'missing_documents',
      title: `${missing.length} required document(s) not on file`,
      category: 'missing_document',
      priority: 'needs_attention',
      certainty:
        'Certain for the configured checklist; depends on documents being classified correctly.',
      observed: `Not found among linked documents: ${labels.join('; ')}.`,
      whyItMatters: 'The product checklist requires these documents before a decision.',
      evidence: [
        {
          label: 'Checklist for product',
          value: required.map(docTypeLabel).join('; '),
          docId: null,
          fieldId: null,
          appId: app.id,
        },
        {
          label: 'Linked documents (excluding failed)',
          value: docs.map((d) => docTypeLabel(d.docType)).join('; ') || 'None',
          docId: null,
          fieldId: null,
          appId: app.id,
        },
      ],
      known: ['Which document types are linked to this application.'],
      unknown: ['Whether a document was uploaded but classified under a different type.'],
      benign: [
        'The borrower may bring the document on a later visit.',
        'A document may be filed under "Other supporting document".',
      ],
      steps: [
        'Request the missing documents from the applicant.',
        'Check unclassified uploads and set their document type.',
      ],
    },
  ];
};

export const reviewState: Check = ({ app, docs }) => {
  const out: Finding[] = [];
  const unreviewed = docs.flatMap((doc) =>
    doc.fields.filter((f) => f.state === 'unreviewed').map((field) => ({ doc, field })),
  );
  if (unreviewed.length > 0) {
    out.push({
      id: `${app.id}:unreviewed_fields`,
      ruleId: 'unreviewed_fields',
      title: `${unreviewed.length} extracted field(s) not yet reviewed`,
      category: 'evidence_incomplete',
      priority: 'needs_attention',
      certainty: 'Certain — review state is recorded per field.',
      observed: `Unreviewed fields in ${new Set(unreviewed.map((u) => u.doc.filename)).size} document(s).`,
      whyItMatters:
        'Machine-extracted values must be confirmed by a person before they are relied on.',
      evidence: unreviewed.slice(0, 8).map(ref),
      known: ['These values have not been confirmed, corrected or marked unclear.'],
      unknown: ['Whether the extracted values are correct.'],
      benign: [],
      steps: ['Open Step 2 (Extract & verify) and review each field against the original.'],
    });
  }
  const unclear = docs.flatMap((doc) =>
    doc.fields.filter((f) => f.state === 'unclear').map((field) => ({ doc, field })),
  );
  if (unclear.length > 0) {
    out.push({
      id: `${app.id}:unclear_fields`,
      ruleId: 'unclear_fields',
      title: `${unclear.length} field(s) marked unclear`,
      category: 'evidence_incomplete',
      priority: 'needs_attention',
      certainty: 'Certain — a reviewer or the reading step marked these unclear.',
      observed: unclear.map((u) => `${u.field.label} (${u.doc.filename})`).join('; '),
      whyItMatters: 'Unclear values cannot be used for verification.',
      evidence: unclear.map(ref),
      known: ['The value could not be read reliably.'],
      unknown: ['The correct value.'],
      benign: ['Poor scans and handwriting are common at branch counters.'],
      steps: ['Ask the applicant for the value and enter it manually, or re-scan the page.'],
    });
  }
  const failed = docs.filter((d) => d.processing === 'failed');
  if (failed.length > 0) {
    out.push({
      id: `${app.id}:failed_documents`,
      ruleId: 'failed_documents',
      title: `${failed.length} document(s) could not be processed`,
      category: 'evidence_incomplete',
      priority: 'needs_attention',
      certainty: 'Certain.',
      observed: failed
        .map((d) => `${d.filename}: ${d.failureReason ?? 'unknown reason'}`)
        .join('; '),
      whyItMatters: 'Information in these documents has not been captured.',
      evidence: failed.map((d) => ({
        label: `${docTypeLabel(d.docType)} · ${d.filename}`,
        value: d.failureReason ?? '',
        docId: d.id,
        fieldId: null,
        appId: app.id,
      })),
      known: ['Processing failed for the listed files.'],
      unknown: ['The content of these documents.'],
      benign: [],
      steps: ['Retake or re-upload the document, or enter its fields manually.'],
    });
  }
  if (app.unverifiedSections.length > 0) {
    out.push({
      id: `${app.id}:unverified_sections`,
      ruleId: 'unverified_sections',
      title: `${app.unverifiedSections.length} form section(s) marked unverified`,
      category: 'evidence_incomplete',
      priority: 'needs_attention',
      certainty: 'Certain — marked by a reviewer.',
      observed: `Sections: ${app.unverifiedSections.join(', ')}.`,
      whyItMatters: 'A reviewer flagged information in these sections as not yet verified.',
      evidence: app.unverifiedSections.map((s) => formRef(app.id, s, 'Marked unverified')),
      known: ['A reviewer marked the sections unverified.'],
      unknown: [],
      benign: [],
      steps: ['Verify the sections and clear the flag in Step 3.'],
    });
  }
  if (!app.data.declaration.purposeDeclared && app.data.loan.purpose.trim() !== '') {
    out.push({
      id: `${app.id}:purpose_declaration`,
      ruleId: 'purpose_declaration',
      title: 'Loan-purpose declaration not recorded',
      category: 'purpose_evidence_gap',
      priority: 'needs_attention',
      certainty: 'Certain — declaration checkbox is not ticked.',
      observed: `Purpose "${app.data.loan.purpose}" is stated but the applicant declaration is not recorded.`,
      whyItMatters: 'Post-disbursement monitoring compares activity with the declared purpose.',
      evidence: [formRef(app.id, 'Declaration', 'Not recorded')],
      known: [],
      unknown: ['Whether the applicant signed a paper declaration.'],
      benign: ['The paper declaration may exist but not be recorded yet.'],
      steps: ['Obtain and record the signed purpose declaration.'],
    });
  }
  return out;
};
