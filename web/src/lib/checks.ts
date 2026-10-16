import { PRIORITY_RANK } from '../domain/labels.js';
import type { Application, Db, ExtractedField, FtDocument, Priority } from '../domain/schemas.js';
import { docTypeLabel } from './doc-catalog.js';
import { formatMoney } from './format.js';
import { parseAreaToHectares } from './land.js';
import { runMonitoring } from './monitoring.js';
import { nameSimilarity, normalizeDigits, normalizeName } from './text.js';

/**
 * Deterministic pre-disbursement checks (spec §7 step 4, §8). They run in the
 * browser over the application form and reviewed document fields. Findings are
 * prompts for human verification, not lending decisions.
 */

export type FindingCategory =
  | 'document_inconsistency'
  | 'missing_document'
  | 'duplicate_identifier'
  | 'entity_relationship'
  | 'financial_mismatch'
  | 'collateral_conflict'
  | 'purpose_evidence_gap'
  | 'evidence_incomplete';

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  document_inconsistency: 'Document inconsistency',
  missing_document: 'Missing required document',
  duplicate_identifier: 'Duplicate identifier',
  entity_relationship: 'Relationship requiring review',
  financial_mismatch: 'Financial-information mismatch',
  collateral_conflict: 'Collateral information conflict',
  purpose_evidence_gap: 'Loan-purpose evidence gap',
  evidence_incomplete: 'Evidence incomplete',
};

export interface EvidenceRef {
  label: string;
  value: string;
  docId: string | null;
  fieldId: string | null;
  appId: string | null;
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  category: FindingCategory;
  priority: Priority;
  certainty: string;
  observed: string;
  whyItMatters: string;
  evidence: EvidenceRef[];
  known: string[];
  unknown: string[];
  benign: string[];
  steps: string[];
}

export type CrossVerdict = 'match' | 'variation' | 'conflict' | 'not_available';

export interface CrossCheck {
  label: string;
  formValue: string;
  docValue: string;
  docId: string | null;
  fieldId: string | null;
  verdict: CrossVerdict;
  note: string;
}

// ---------- helpers ----------

export type NameVerdict = 'match' | 'variation' | 'mismatch';

/** Order-insensitive token comparison that tolerates initials and minor spelling variants. */
export function compareNames(a: string, b: string): NameVerdict {
  const ta = normalizeName(a).split(' ').filter((t) => t !== '');
  const tb = normalizeName(b).split(' ').filter((t) => t !== '');
  if (ta.length === 0 || tb.length === 0) return 'mismatch';
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let exact = true;
  const used = new Set<number>();
  for (const tok of short) {
    let idx = long.findIndex((l, i) => !used.has(i) && l === tok);
    if (idx < 0) {
      exact = false;
      idx = long.findIndex(
        (l, i) =>
          !used.has(i) &&
          ((tok.length === 1 && l.startsWith(tok)) ||
            (l.length === 1 && tok.startsWith(l)) ||
            nameSimilarity(l, tok) >= 0.8),
      );
    }
    if (idx < 0) return 'mismatch';
    used.add(idx);
  }
  if (short.length !== long.length) exact = false;
  return exact ? 'match' : 'variation';
}

/** Parses YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY (any digits) to YYYY-MM-DD. */
export function normalizeDate(raw: string): string | null {
  const s = normalizeDigits(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d = '', m = '', y = ''] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export function normalizeIdentifier(raw: string): string {
  return normalizeDigits(raw).replace(/\s+/g, '').toUpperCase();
}

function parseNumber(raw: string): number | null {
  const s = normalizeDigits(raw).replace(/[₹,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const NIL = /निरंक|^\s*(nil|none|no)\s*$|बोजा\s*[—-]\s*निरंक/i;

interface DocField {
  doc: FtDocument;
  field: ExtractedField;
}

function fieldsOf(docs: FtDocument[], key: string): DocField[] {
  return docs.flatMap((doc) =>
    doc.fields.filter((f) => f.key === key && f.value.trim() !== '').map((field) => ({ doc, field })),
  );
}

function ref(df: DocField): EvidenceRef {
  return {
    label: `${docTypeLabel(df.doc.docType)} · ${df.doc.filename} · page ${df.field.page + 1} · ${df.field.label}`,
    value: df.field.value,
    docId: df.doc.id,
    fieldId: df.field.id,
    appId: df.doc.applicationId,
  };
}

function formRef(appId: string, label: string, value: string): EvidenceRef {
  return { label: `Application form · ${label}`, value, docId: null, fieldId: null, appId };
}

function certaintyFor(dfs: DocField[]): string {
  const unreviewed = dfs.some((d) => d.field.state === 'unreviewed');
  const handwritten = dfs.some((d) => d.field.quality === 'handwritten' || d.field.quality === 'low');
  const simulated = dfs.some((d) => d.field.origin === 'simulated');
  const parts = [
    unreviewed ? 'Uses machine-extracted values not yet confirmed by a reviewer.' : 'Uses values confirmed or entered by a reviewer.',
  ];
  if (handwritten) parts.push('Includes handwritten text, which is read with lower confidence.');
  if (simulated) parts.push('Extracted values are simulated demo output.');
  if (dfs.some((d) => d.field.origin === 'gemini'))
    parts.push('Includes values read by Gemini (AI), which can misread text.');
  return parts.join(' ');
}

const PERSON_DOCS = new Set(['aadhaar', 'pan', 'voter_id', 'passport', 'satbara', 'application_form']);
const COMPANY_ONLY_DOCS: Record<string, string[]> = {
  board_resolution: ['private_limited'],
  company_registration: ['private_limited'],
  partnership_deed: ['partnership'],
};

// ---------- individual checks ----------

type Ctx = { app: Application; docs: FtDocument[]; db: Db };
type Check = (ctx: Ctx) => Finding[];

const requiredFields: Check = ({ app }) => {
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

const missingDocuments: Check = ({ app, docs, db }) => {
  const required = db.settings.checklists[app.data.loan.product] ?? [];
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
      certainty: 'Certain for the configured checklist; depends on documents being classified correctly.',
      observed: `Not found among linked documents: ${labels.join('; ')}.`,
      whyItMatters: 'The product checklist requires these documents before a decision.',
      evidence: [
        { label: 'Checklist for product', value: required.map(docTypeLabel).join('; '), docId: null, fieldId: null, appId: app.id },
        { label: 'Linked documents (excluding failed)', value: docs.map((d) => docTypeLabel(d.docType)).join('; ') || 'None', docId: null, fieldId: null, appId: app.id },
      ],
      known: ['Which document types are linked to this application.'],
      unknown: ['Whether a document was uploaded but classified under a different type.'],
      benign: ['The borrower may bring the document on a later visit.', 'A document may be filed under "Other supporting document".'],
      steps: ['Request the missing documents from the applicant.', 'Check unclassified uploads and set their document type.'],
    },
  ];
};

const nameConsistency: Check = ({ app, docs }) => {
  const formName = app.data.applicant.fullName;
  if (formName.trim() === '') return [];
  const personal = app.borrowerType === 'individual' || app.borrowerType === 'farmer';
  const candidates = fieldsOf(docs, 'applicant_name_latin').filter(
    (d) => PERSON_DOCS.has(d.doc.docType ?? '') || (personal && d.doc.docType === 'bank_statement'),
  );
  const conflicts = candidates.filter((d) => compareNames(formName, d.field.value) === 'mismatch');
  if (conflicts.length === 0) return [];
  return [
    {
      id: `${app.id}:name_mismatch`,
      ruleId: 'name_mismatch',
      title: 'Applicant name differs across documents',
      category: 'document_inconsistency',
      priority: 'needs_attention',
      certainty: `${certaintyFor(conflicts)} Name similarity is a heuristic and is not proof of identity either way.`,
      observed: `Form name "${formName}" does not match ${conflicts.map((c) => `"${c.field.value}"`).join(', ')}.`,
      whyItMatters: 'Documents may belong to a different person, or the name may be recorded inconsistently.',
      evidence: [formRef(app.id, 'Applicant name', formName), ...conflicts.map(ref)],
      known: ['The extracted/entered names differ beyond initials or minor spelling variation.'],
      unknown: ['Whether the documents belong to the same person.'],
      benign: ['Marriage, transliteration or nicknames can change how a name is written.'],
      steps: ['Compare the original documents in person.', 'Record the reason for any legitimate variation.'],
    },
  ];
};

const dobConflict: Check = ({ app, docs }) => {
  const formDob = normalizeDate(app.data.applicant.dob);
  const dobs = fieldsOf(docs, 'dob');
  const all = [
    ...(formDob === null ? [] : [{ value: formDob, ref: formRef(app.id, 'Date of birth', app.data.applicant.dob) }]),
    ...dobs.flatMap((d) => {
      const v = normalizeDate(d.field.value);
      return v === null ? [] : [{ value: v, ref: ref(d) }];
    }),
  ];
  if (new Set(all.map((x) => x.value)).size <= 1) return [];
  return [
    {
      id: `${app.id}:dob_conflict`,
      ruleId: 'dob_conflict',
      title: 'Date of birth differs between sources',
      category: 'document_inconsistency',
      priority: 'needs_attention',
      certainty: certaintyFor(dobs),
      observed: `Dates found: ${all.map((x) => x.value).join(' vs ')}.`,
      whyItMatters: 'Identity details should agree across KYC and the application.',
      evidence: all.map((x) => x.ref),
      known: ['The recorded dates are not identical after normalising digits and format.'],
      unknown: ['Which date is correct.'],
      benign: ['Handwritten digits (e.g. ६ and ८) are easily misread.', 'Day and month may be swapped.'],
      steps: ['Check the original documents.', 'Correct the field and record which source was used.'],
    },
  ];
};

const landArea: Check = ({ app, docs, db }) => {
  const c = app.data.collateral;
  if (c.landArea.trim() === '') return [];
  const formHa = parseAreaToHectares(c.landArea, c.landUnit);
  const records = fieldsOf(docs, 'land_area').filter((d) => d.doc.docType === 'satbara');
  const tol = db.settings.monitoring.landAreaTolerancePercent / 100;
  const conflicts = records.filter((d) => {
    const ha = parseAreaToHectares(d.field.value, 'hectare');
    return formHa !== null && ha !== null && Math.abs(ha - formHa) > Math.max(ha, formHa) * tol;
  });
  if (conflicts.length === 0) return [];
  return [
    {
      id: `${app.id}:land_area`,
      ruleId: 'land_area',
      title: 'Land area on form differs from 7/12 extract',
      category: 'collateral_conflict',
      priority: 'needs_attention',
      certainty: `${certaintyFor(conflicts)} Unit conversion: 1 hectare = 100 are; the 7/12 "हे-आर" notation is read as hectares and ares.`,
      observed: `Form: ${c.landArea} ${c.landUnit} (${formHa?.toFixed(2) ?? '?'} ha). 7/12: ${conflicts.map((d) => `${d.field.value} (${parseAreaToHectares(d.field.value, 'hectare')?.toFixed(2) ?? '?'} ha)`).join(', ')}.`,
      whyItMatters: 'Loan eligibility and collateral value depend on the land actually held.',
      evidence: [formRef(app.id, 'Land area', `${c.landArea} ${c.landUnit}`), ...conflicts.map(ref)],
      known: ['The two values differ by more than the configured tolerance.'],
      unknown: ['Whether the applicant cultivates additional leased or family land.'],
      benign: ['The applicant may hold land under more than one survey number.', 'Units may have been written differently (acre vs hectare).'],
      steps: ['Ask for 7/12 extracts for all land declared.', 'Correct the form value if it was misread.'],
    },
  ];
};

const encumbrance: Check = ({ app, docs }) => {
  const notes = fieldsOf(docs, 'encumbrance_note').filter((d) => !NIL.test(d.field.value));
  if (notes.length === 0) return [];
  return [
    {
      id: `${app.id}:encumbrance`,
      ruleId: 'encumbrance',
      title: 'Existing charge recorded on 7/12 extract',
      category: 'collateral_conflict',
      priority: 'needs_attention',
      certainty: certaintyFor(notes),
      observed: `"Other rights" column reads: ${notes.map((n) => `"${n.field.value}"`).join(', ')}.`,
      whyItMatters: 'An existing lien may limit the collateral available for this loan.',
      evidence: notes.map(ref),
      known: ['An entry appears in the other-rights (इतर हक्क) column.'],
      unknown: ['Whether the earlier loan has been repaid and the entry not yet removed.'],
      benign: ['Society crop loans are commonly recorded and may already be closed.'],
      steps: ['Obtain a no-dues certificate or current outstanding from the lender named.'],
    },
  ];
};

function duplicateCheck(
  ctx: Ctx,
  opts: { ruleId: string; formValue: string; fieldKey: string; appValue: (a: Application) => string; label: string; urgentAcrossBorrowers: boolean },
): Finding[] {
  const { app, db } = ctx;
  const target = normalizeIdentifier(opts.formValue);
  if (target === '') return [];
  const others = db.applications.filter((a) => a.id !== app.id && normalizeIdentifier(opts.appValue(a)) === target);
  const otherDocs = db.documents.filter(
    (d) => d.applicationId !== app.id && d.fields.some((f) => f.key === opts.fieldKey && normalizeIdentifier(f.value) === target),
  );
  const otherAppIds = [...new Set([...others.map((a) => a.id), ...otherDocs.flatMap((d) => (d.applicationId === null ? [] : [d.applicationId]))])];
  if (otherAppIds.length === 0) return [];
  const otherApps = otherAppIds.flatMap((id) => db.applications.filter((a) => a.id === id));
  const sameBorrower = otherApps.every((a) => a.borrowerId !== null && a.borrowerId === app.borrowerId);
  const live = otherApps.some((a) => a.status !== 'declined');
  const priority: Priority = sameBorrower ? 'routine' : live && opts.urgentAcrossBorrowers ? 'urgent' : 'needs_attention';
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
        ...otherApps.map((a) => ({ label: `Application ${a.id} · ${opts.label}`, value: opts.appValue(a) || opts.formValue, docId: null, fieldId: null, appId: a.id })),
        ...otherDocs.map((d) => ({ label: `${docTypeLabel(d.docType)} · ${d.filename}`, value: opts.formValue, docId: d.id, fieldId: d.fields.find((f) => f.key === opts.fieldKey)?.id ?? null, appId: d.applicationId })),
      ],
      known: ['The identifier string matches exactly.'],
      unknown: ['Whether the earlier pledge has been released.', 'Whether the documents are genuine — reading text does not establish authenticity.'],
      benign: sameBorrower
        ? ['Renewals and re-applications reuse the same collateral.']
        : ['A previous pledge may have been released and the receipt re-issued.', 'A typing error may have produced the same number.'],
      steps: sameBorrower
        ? ['Confirm the earlier application is closed or declined.']
        : ['Confirm the receipt / land record status with the issuing authority.', 'Check lien marking on the earlier loan.', 'Hold the application until confirmed.'],
    },
  ];
}

const duplicateSurvey: Check = (ctx) =>
  duplicateCheck(ctx, {
    ruleId: 'duplicate_survey',
    formValue: ctx.app.data.collateral.surveyNumber,
    fieldKey: 'survey_number',
    appValue: (a) => a.data.collateral.surveyNumber,
    label: 'Survey / Gat number',
    urgentAcrossBorrowers: false,
  });

const duplicateReceipt: Check = (ctx) =>
  duplicateCheck(ctx, {
    ruleId: 'duplicate_receipt',
    formValue: ctx.app.data.collateral.warehouseReceiptNo,
    fieldKey: 'receipt_number',
    appValue: (a) => a.data.collateral.warehouseReceiptNo,
    label: 'Warehouse receipt',
    urgentAcrossBorrowers: true,
  });

const incomeMismatch: Check = ({ app, docs, db }) => {
  const declared = app.data.financial.declaredAnnualIncomeMinor;
  if (declared === null) return [];
  const credits = fieldsOf(docs, 'avg_monthly_credit');
  const first = credits[0];
  if (first === undefined) return [];
  const monthly = parseNumber(first.field.value);
  if (monthly === null || monthly === 0) return [];
  const observedAnnual = Math.round(monthly * 12 * 100);
  const ratio = declared / observedAnnual;
  if (ratio <= db.settings.monitoring.incomeMismatchRatio) return [];
  return [
    {
      id: `${app.id}:income_mismatch`,
      ruleId: 'income_mismatch',
      title: 'Declared income is higher than bank-statement credits',
      category: 'financial_mismatch',
      priority: 'needs_attention',
      certainty: `${certaintyFor([first])} Calculation: average monthly credits × 12.`,
      observed: `Declared ${formatMoney(declared)} per year; statement credits suggest about ${formatMoney(observedAnnual)} (${ratio.toFixed(1)}×).`,
      whyItMatters: 'Repayment capacity is assessed on declared income.',
      evidence: [formRef(app.id, 'Declared annual income', formatMoney(declared)), ref(first)],
      known: [`The ratio exceeds the configured threshold of ${db.settings.monitoring.incomeMismatchRatio}×.`],
      unknown: ['Income received in cash or into other accounts.'],
      benign: ['Agricultural and trading income is often received in cash or seasonally.'],
      steps: ['Request statements for other accounts or ITR.', 'Record the basis of the income assessment.'],
    },
  ];
};

const reviewState: Check = ({ app, docs }) => {
  const out: Finding[] = [];
  const unreviewed = docs.flatMap((doc) => doc.fields.filter((f) => f.state === 'unreviewed').map((field) => ({ doc, field })));
  if (unreviewed.length > 0) {
    out.push({
      id: `${app.id}:unreviewed_fields`,
      ruleId: 'unreviewed_fields',
      title: `${unreviewed.length} extracted field(s) not yet reviewed`,
      category: 'evidence_incomplete',
      priority: 'needs_attention',
      certainty: 'Certain — review state is recorded per field.',
      observed: `Unreviewed fields in ${new Set(unreviewed.map((u) => u.doc.filename)).size} document(s).`,
      whyItMatters: 'Machine-extracted values must be confirmed by a person before they are relied on.',
      evidence: unreviewed.slice(0, 8).map(ref),
      known: ['These values have not been confirmed, corrected or marked unclear.'],
      unknown: ['Whether the extracted values are correct.'],
      benign: [],
      steps: ['Open Step 2 (Extract & verify) and review each field against the original.'],
    });
  }
  const unclear = docs.flatMap((doc) => doc.fields.filter((f) => f.state === 'unclear').map((field) => ({ doc, field })));
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
      observed: failed.map((d) => `${d.filename}: ${d.failureReason ?? 'unknown reason'}`).join('; '),
      whyItMatters: 'Information in these documents has not been captured.',
      evidence: failed.map((d) => ({ label: `${docTypeLabel(d.docType)} · ${d.filename}`, value: d.failureReason ?? '', docId: d.id, fieldId: null, appId: app.id })),
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

const relationshipReview: Check = ({ app, db }) => {
  const borrower = db.borrowers.find((b) => b.id === app.borrowerId);
  if (borrower === undefined) return [];
  const openCases = db.cases.filter((c) => !['resolved', 'closed'].includes(c.status));
  const caseEntities = new Map(openCases.flatMap((c) => c.entityIds.map((e) => [e, c] as const)));
  const rels = db.relationships.filter(
    (r) => r.type !== 'borrower_for' && (r.from === borrower.entityId || r.to === borrower.entityId),
  );
  const hits = rels.flatMap((r) => {
    const other = r.from === borrower.entityId ? r.to : r.from;
    const c = caseEntities.get(other);
    // Skip cases where the applicant is already a subject — that exposure is known.
    if (c === undefined || c.entityIds.includes(borrower.entityId)) return [];
    return [{ r, other, c }];
  });
  if (hits.length === 0) return [];
  const names = new Map(db.entities.map((e) => [e.id, e.name]));
  return [
    {
      id: `${app.id}:relationship_review`,
      ruleId: 'relationship_review',
      title: 'Applicant is related to a party in an open investigation',
      category: 'entity_relationship',
      priority: 'needs_attention',
      certainty: `Based on recorded relationships (${[...new Set(hits.map((h) => h.r.status.replace(/_/g, ' ')))].join(', ')}). A relationship does not establish wrongdoing.`,
      observed: hits.map((h) => `${names.get(h.other) ?? h.other} — ${h.r.type.replace(/_/g, ' ')} (${h.r.status.replace(/_/g, ' ')}), in ${h.c.id}`).join('; '),
      whyItMatters: 'Reviewers should be aware of related exposure when assessing the application.',
      evidence: hits.map((h) => ({ label: `Relationship · ${h.r.source}`, value: h.r.evidence, docId: null, fieldId: null, appId: null })),
      known: ['The recorded relationships and the open case.'],
      unknown: ['Whether the applicant has any involvement in the matters under investigation.'],
      benign: ['Family members commonly share an address.', 'Business associates may act as guarantors without other involvement.'],
      steps: ['Note the relationship in the appraisal.', 'Consult the case owner before a decision.'],
    },
  ];
};

const CHECKS: Check[] = [
  requiredFields,
  missingDocuments,
  nameConsistency,
  dobConflict,
  landArea,
  encumbrance,
  duplicateSurvey,
  duplicateReceipt,
  incomeMismatch,
  relationshipReview,
  reviewState,
];

export const CHECK_NAMES = [
  'Required fields present',
  'Document checklist for loan product',
  'Name consistency across documents',
  'Date-of-birth consistency',
  'Land area vs 7/12 extract',
  'Existing charges on 7/12',
  'Survey number reuse',
  'Warehouse receipt reuse',
  'Declared income vs bank credits',
  'Relationships to open investigations',
  'Field review status',
] as const;

export function applicationDocs(app: Application, db: Db): FtDocument[] {
  return db.documents.filter((d) => app.documentIds.includes(d.id));
}

const cache = new WeakMap<Db, Map<string, Finding[]>>();

export function runChecks(app: Application, db: Db): Finding[] {
  let perDb = cache.get(db);
  if (perDb === undefined) {
    perDb = new Map();
    cache.set(db, perDb);
  }
  const hit = perDb.get(app.id);
  if (hit !== undefined) return hit;
  const ctx = { app, docs: applicationDocs(app, db), db };
  const out = CHECKS.flatMap((c) => c(ctx)).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  perDb.set(app.id, out);
  return out;
}

/** Overall review priority: highest priority among unresolved findings. */
export function reviewPriority(app: Application, db: Db): Priority | null {
  if (app.checksRunAt === null) return null;
  let best: Priority = 'routine';
  for (const f of runChecks(app, db)) {
    const st = app.findingStates[f.id]?.status;
    if (st === 'resolved' || st === 'not_an_issue') continue;
    if (PRIORITY_RANK[f.priority] > PRIORITY_RANK[best]) best = f.priority;
  }
  return best;
}

export function crossChecks(app: Application, db: Db): CrossCheck[] {
  const docs = applicationDocs(app, db);
  const rows: CrossCheck[] = [];
  const d = app.data;
  for (const df of fieldsOf(docs, 'applicant_name_latin')) {
    const v = compareNames(d.applicant.fullName, df.field.value);
    rows.push({ label: 'Name', formValue: d.applicant.fullName || '—', docValue: df.field.value, docId: df.doc.id, fieldId: df.field.id,
      verdict: v === 'mismatch' ? 'conflict' : v, note: v === 'variation' ? 'Initial or minor spelling variant' : '' });
  }
  for (const df of fieldsOf(docs, 'dob')) {
    const a = normalizeDate(d.applicant.dob);
    const b = normalizeDate(df.field.value);
    rows.push({ label: 'Date of birth', formValue: d.applicant.dob || '—', docValue: df.field.value, docId: df.doc.id, fieldId: df.field.id,
      verdict: a === null || b === null ? 'not_available' : a === b ? 'match' : 'conflict', note: b !== df.field.value && b !== null ? `Read as ${b}` : '' });
  }
  for (const df of fieldsOf(docs, 'survey_number')) {
    const same = normalizeIdentifier(d.collateral.surveyNumber) === normalizeIdentifier(df.field.value);
    rows.push({ label: 'Survey / Gat number', formValue: d.collateral.surveyNumber || '—', docValue: df.field.value, docId: df.doc.id, fieldId: df.field.id,
      verdict: d.collateral.surveyNumber === '' ? 'not_available' : same ? 'match' : 'conflict', note: same && d.collateral.surveyNumber !== df.field.value ? 'Same after normalising Marathi digits' : '' });
  }
  for (const df of fieldsOf(docs, 'land_area')) {
    const a = parseAreaToHectares(d.collateral.landArea, d.collateral.landUnit);
    const b = parseAreaToHectares(df.field.value, 'hectare');
    const tol = db.settings.monitoring.landAreaTolerancePercent / 100;
    rows.push({ label: 'Land area', formValue: d.collateral.landArea === '' ? '—' : `${d.collateral.landArea} ${d.collateral.landUnit}`, docValue: df.field.value, docId: df.doc.id, fieldId: df.field.id,
      verdict: a === null || b === null ? 'not_available' : Math.abs(a - b) <= Math.max(a, b) * tol ? 'match' : 'conflict', note: b === null ? 'Could not parse unit — confirm manually' : `${b.toFixed(2)} ha` });
  }
  for (const df of fieldsOf(docs, 'receipt_number')) {
    const same = normalizeIdentifier(d.collateral.warehouseReceiptNo) === normalizeIdentifier(df.field.value);
    rows.push({ label: 'Warehouse receipt', formValue: d.collateral.warehouseReceiptNo || '—', docValue: df.field.value, docId: df.doc.id, fieldId: df.field.id, verdict: same ? 'match' : 'conflict', note: '' });
  }
  return rows;
}

/** Monitoring alerts for loans that originated from this application. */
export function loanAlertsForApplication(app: Application, db: Db): ReturnType<typeof runMonitoring> {
  const loanIds = new Set(db.loans.filter((l) => l.applicationId === app.id).map((l) => l.id));
  return runMonitoring(db).filter((a) => loanIds.has(a.loanId));
}
