/** Consistency rules across documents: name, date of birth and income. */

import { formatMoney } from '../format.js';
import type { Check } from './types.js';
import { PERSON_DOCS, certaintyFor, fieldsOf, formRef, ref } from './evidence.js';
import { compareNames, normalizeDate, parseNumber } from './normalize.js';

export const nameConsistency: Check = ({ app, docs }) => {
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
      whyItMatters:
        'Documents may belong to a different person, or the name may be recorded inconsistently.',
      evidence: [formRef(app.id, 'Applicant name', formName), ...conflicts.map(ref)],
      known: ['The extracted/entered names differ beyond initials or minor spelling variation.'],
      unknown: ['Whether the documents belong to the same person.'],
      benign: ['Marriage, transliteration or nicknames can change how a name is written.'],
      steps: [
        'Compare the original documents in person.',
        'Record the reason for any legitimate variation.',
      ],
    },
  ];
};

export const dobConflict: Check = ({ app, docs }) => {
  const formDob = normalizeDate(app.data.applicant.dob);
  const dobs = fieldsOf(docs, 'dob');
  const all = [
    ...(formDob === null
      ? []
      : [{ value: formDob, ref: formRef(app.id, 'Date of birth', app.data.applicant.dob) }]),
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
      benign: [
        'Handwritten digits (e.g. ६ and ८) are easily misread.',
        'Day and month may be swapped.',
      ],
      steps: [
        'Check the original documents.',
        'Correct the field and record which source was used.',
      ],
    },
  ];
};

export const incomeMismatch: Check = ({ app, docs, db }) => {
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
      known: [
        `The ratio exceeds the configured threshold of ${db.settings.monitoring.incomeMismatchRatio}×.`,
      ],
      unknown: ['Income received in cash or into other accounts.'],
      benign: ['Agricultural and trading income is often received in cash or seasonally.'],
      steps: [
        'Request statements for other accounts or ITR.',
        'Record the basis of the income assessment.',
      ],
    },
  ];
};
