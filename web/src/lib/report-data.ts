/** Report figures for one period and branch (`all` for every branch); pure, so it is unit-tested. */

import type { Db } from '../domain/schemas.js';
import { allAlerts } from './alerts.js';
import { runChecks } from './checks.js';
import { inRange } from './period.js';
import type { Range } from './period.js';

export interface ReportData {
  apps: Db['applications'];
  docs: Db['documents'];
  fields: Db['documents'][number]['fields'];
  alerts: ReturnType<typeof allAlerts>;
  loans: Db['loans'];
  txns: Db['transactions'];
  findings: { a: Db['applications'][number]; f: ReturnType<typeof runChecks>[number] }[];
  cases: Db['cases'];
}

export function computeReportData(db: Db, r: Range, branch: string): ReportData {
  const inB = (b: string): boolean => branch === 'all' || b === branch;
  const apps = db.applications.filter(
    (a) => inB(a.branchId) && inRange(a.submittedAt ?? a.createdAt, r),
  );
  const docs = db.documents.filter(
    (d) =>
      inRange(d.uploadedAt, r) &&
      (d.applicationId === null ||
        apps.some((a) => a.id === d.applicationId) ||
        inB(db.applications.find((a) => a.id === d.applicationId)?.branchId ?? '')),
  );
  const fields = docs.flatMap((d) => d.fields);
  const alerts = allAlerts(db).filter((a) => inB(a.branchId) && inRange(a.at, r));
  const loans = db.loans.filter((l) => inB(l.branchId));
  const txns = db.transactions.filter(
    (t) => inRange(t.at, r) && loans.some((l) => l.id === t.loanId),
  );
  const findings = apps.flatMap((a) =>
    a.checksRunAt === null ? [] : runChecks(a, db).map((f) => ({ a, f })),
  );
  const cases = db.cases.filter((c) => inB(c.branchId));
  return { apps, docs, fields, alerts, loans, txns, findings, cases };
}
