/** Relationship rules: links to open investigations; public records run separately. */

import { publicRecordsFindings } from '../public-records-findings.js';
import type { Check } from './types.js';

export const relationshipReview: Check = ({ app, db }) => {
  const borrower = db.borrowers.find((b) => b.id === app.borrowerId);
  if (borrower === undefined) return [];
  const openCases = db.cases.filter((c) => !['resolved', 'closed'].includes(c.status));
  const caseEntities = new Map(openCases.flatMap((c) => c.entityIds.map((e) => [e, c] as const)));
  const rels = db.relationships.filter(
    (r) =>
      r.type !== 'borrower_for' && (r.from === borrower.entityId || r.to === borrower.entityId),
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
      observed: hits
        .map(
          (h) =>
            `${names.get(h.other) ?? h.other} — ${h.r.type.replace(/_/g, ' ')} (${h.r.status.replace(/_/g, ' ')}), in ${h.c.id}`,
        )
        .join('; '),
      whyItMatters: 'Reviewers should be aware of related exposure when assessing the application.',
      evidence: hits.map((h) => ({
        label: `Relationship · ${h.r.source}`,
        value: h.r.evidence,
        docId: null,
        fieldId: null,
        appId: null,
      })),
      known: ['The recorded relationships and the open case.'],
      unknown: ['Whether the applicant has any involvement in the matters under investigation.'],
      benign: [
        'Family members commonly share an address.',
        'Business associates may act as guarantors without other involvement.',
      ],
      steps: [
        'Note the relationship in the appraisal.',
        'Consult the case owner before a decision.',
      ],
    },
  ];
};

export const publicRecords: Check = ({ app }) => publicRecordsFindings(app);
