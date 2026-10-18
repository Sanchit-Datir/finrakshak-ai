/** Loan applications of the demo bank, built in a fixed order so audit and document ids are stable. */

import type { Application, ApplicationData } from '../../domain/schemas.js';
import { audit } from './audit.js';
import type { SeedContext } from './context.js';
import type { DocumentBook } from './documents.js';
import type { ApplicationKit } from './applications/kit.js';
import { seedA1001, seedA1002, seedA1015 } from './applications/crop-loans.js';
import { seedA1008, seedA1012, seedA1014 } from './applications/agri-term.js';
import { seedA1003, seedA1009 } from './applications/warehouse-receipt.js';
import { seedA1005, seedA1011 } from './applications/msme-term.js';
import { seedA1007, seedA1010, seedA1013 } from './applications/msme-working-capital.js';
import { seedA1006 } from './applications/personal.js';

export interface NewApplication {
  id: string;
  borrowerId: string | null;
  type: Application['borrowerType'];
  branchId: string;
  status: Application['status'];
  days: number;
  data: ApplicationData;
  checks?: boolean;
  step?: number;
  notes?: string[];
}

function createApplicationBook(ctx: SeedContext): {
  apps: Application[];
  addApp: (o: NewApplication) => Application;
  link: (app: Application, ...ids: string[]) => void;
} {
  const { ago, plus, officer, manager } = ctx;
  const apps: Application[] = [];
  const addApp = (o: NewApplication): Application => {
    const created = ago(o.days, 10);
    const submitted = o.status === 'draft' ? null : plus(created, 3);
    const a: Application = {
      id: o.id,
      borrowerId: o.borrowerId,
      borrowerType: o.type,
      branchId: o.branchId,
      status: o.status,
      createdAt: created,
      submittedAt: submitted,
      updatedAt: plus(created, 26),
      createdBy: officer,
      step: o.step ?? 4,
      data: o.data,
      unverifiedSections: [],
      documentIds: [],
      notes: (o.notes ?? []).map((text, i) => ({
        id: `${o.id}-n${i}`,
        author: i === 0 ? officer : manager,
        at: plus(created, 5 + i * 20),
        text,
      })),
      audit: [audit(created, officer, 'Application created', 'Created from branch counter')],
      checksRunAt: o.checks === false ? null : plus(created, 4),
      findingStates: {},
      publicRecords: null,
      aiAnalysis: null,
      aiInvestigation: null,
    };
    if (submitted !== null)
      a.audit.push(
        audit(
          submitted,
          officer,
          'Status changed',
          `Set to ${o.status.replace(/_/g, ' ')} (demo state)`,
        ),
      );
    apps.push(a);
    return a;
  };
  const link = (app: Application, ...ids: string[]): void => {
    app.documentIds.push(...ids);
  };
  return { apps, addApp, link };
}

/** Every demo application, in the order the original dataset created them. */
const SEEDS: readonly ((kit: ApplicationKit) => void)[] = [
  seedA1001,
  seedA1002,
  seedA1003,
  seedA1009,
  seedA1005,
  seedA1006,
  seedA1007,
  seedA1008,
  seedA1010,
  seedA1011,
  seedA1012,
  seedA1013,
  seedA1014,
  seedA1015,
];

export function demoApplications(ctx: SeedContext, documents: DocumentBook): Application[] {
  const book = createApplicationBook(ctx);
  const kit: ApplicationKit = {
    ...ctx,
    addApp: book.addApp,
    link: book.link,
    addDoc: documents.addDoc,
    docCount: documents.count,
  };
  for (const seed of SEEDS) seed(kit);
  return book.apps;
}
