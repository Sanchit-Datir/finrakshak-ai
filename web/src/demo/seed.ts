/**
 * Synthetic demonstration dataset. Every person, business, account and amount
 * is fictional. Dates are generated relative to the moment the dataset is
 * created so dashboard periods stay meaningful. One module per section in `./seed/`.
 */

import type { Db } from '../domain/schemas.js';
import { demoAlertStates } from './seed/alert-states.js';
import { demoApplications } from './seed/applications.js';
import { resetAuditSeq } from './seed/audit.js';
import { demoBorrowers } from './seed/borrowers.js';
import { demoCases } from './seed/cases.js';
import { BANK_NAME } from './seed/constants.js';
import { seedContext } from './seed/context.js';
import { createDocumentBook } from './seed/documents.js';
import { demoEntities } from './seed/entities.js';
import { demoLoans } from './seed/loans.js';
import { demoRelationships } from './seed/relationships.js';
import { defaultSettings } from './seed/settings.js';
import { addTestLoans } from './seed/test-loans.js';

export { BANK_NAME, DEMO_USERS } from './seed/constants.js';
export { newApplicationData } from './seed/application-data.js';
export { defaultSettings } from './seed/settings.js';

/** Builds a fresh synthetic dataset. Sections run in a fixed order: ids are numbered in call order. */
export function createDemoDb(now: Date = new Date()): Db {
  resetAuditSeq();
  const ctx = seedContext(now);
  const entities = demoEntities();
  const borrowers = demoBorrowers(ctx);
  const documents = createDocumentBook(ctx);
  const applications = demoApplications(ctx, documents);
  const { relationships, rel } = demoRelationships(ctx);
  const { loans, transactions, circ1 } = demoLoans(ctx, entities, relationships, rel);
  addTestLoans(ctx, { entities, borrowers, loans, relationships, rel });
  const alertStates = demoAlertStates(ctx, circ1);
  const cases = demoCases(ctx, circ1);

  return {
    version: 1,
    generatedAt: now.toISOString(),
    bankName: BANK_NAME,
    branches: [
      { id: 'br-shirur', name: 'Mumbai Branch' },
      { id: 'br-junnar', name: 'Delhi Branch' },
      { id: 'br-baramati', name: 'Pune Branch' },
      { id: 'br-kolkata', name: 'Kolkata Branch' },
    ],
    borrowers,
    applications,
    documents: documents.docs,
    entities,
    relationships,
    loans,
    transactions,
    alertStates,
    cases,
    settings: defaultSettings(),
    readAlertIds: [],
    publicWatches: [],
    counters: { application: 1015, document: documents.count(), case: 15 },
  };
}

/** A workspace with no records — used to demonstrate empty states. */
export function createEmptyDb(now: Date = new Date()): Db {
  const demo = createDemoDb(now);
  return {
    ...demo,
    borrowers: [],
    applications: [],
    documents: [],
    entities: demo.entities.filter((e) => e.kind === 'counterparty'),
    relationships: [],
    loans: [],
    transactions: [],
    alertStates: {},
    cases: [],
    publicWatches: [],
    counters: { application: 1000, document: 0, case: 0 },
  };
}
