/** The check registry, the cached runner and review priority. */

import { PRIORITY_RANK } from '../../domain/labels.js';
import type { Application, Db, FtDocument, Priority } from '../../domain/schemas.js';
import { runMonitoring } from '../monitoring.js';
import type { Check, Finding } from './types.js';
import { missingDocuments, requiredFields, reviewState } from './completeness.js';
import {
  dobConflict,
  encumbrance,
  incomeMismatch,
  landArea,
  nameConsistency,
} from './consistency.js';
import { duplicateReceipt, duplicateSurvey } from './duplicates.js';
import { publicRecords, relationshipReview } from './relationships.js';

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
  publicRecords,
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
  'Public records: applicant and customers',
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
  const out = CHECKS.flatMap((c) => c(ctx)).sort(
    (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  );
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

/** Monitoring alerts for loans that originated from this application. */
export function loanAlertsForApplication(
  app: Application,
  db: Db,
): ReturnType<typeof runMonitoring> {
  const loanIds = new Set(db.loans.filter((l) => l.applicationId === app.id).map((l) => l.id));
  return runMonitoring(db).filter((a) => loanIds.has(a.loanId));
}
