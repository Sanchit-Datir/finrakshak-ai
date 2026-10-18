import {
  ALERT_STATUS_LABEL,
  APP_STATUS_LABEL,
  BORROWER_TYPE_LABEL,
  CASE_STATUS_LABEL,
  EVIDENCE_STATUS_LABEL,
  EVIDENCE_TYPE_LABEL,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  PRODUCT_LABEL,
} from '../../domain/labels.js';
import type { Application, Case, Db, Loan } from '../../domain/schemas.js';
import { allAlerts, isOpen, SOURCE_LABEL, type UnifiedAlert } from '../alerts.js';
import { applicationDocs, reviewPriority, runChecks } from '../checks.js';
import { docTypeLabel } from '../doc-catalog.js';
import { formatDate, formatMoney } from '../format.js';
import { navCounts } from '../nav-counts.js';
import {
  addFinding,
  addTransaction,
  packBuilder,
  type ContextPack,
  type PackBuilder,
} from './pack.js';

export type { ContextPack } from './pack.js';

/** What the copilot is looking at: one record, or the portfolio when no record is open. */
export type CopilotTarget =
  | { kind: 'portfolio' }
  | { kind: 'application' | 'borrower' | 'loan' | 'alert' | 'case'; id: string };

export const targetKey = (t: CopilotTarget): string =>
  t.kind === 'portfolio' ? 'portfolio' : `${t.kind}:${t.id}`;

const byPriority = <T extends { priority: UnifiedAlert['priority'] }>(a: T, b: T): number =>
  PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
const appName = (a: Application): string =>
  a.data.business.businessName || a.data.applicant.fullName || a.id;
const branchName = (db: Db, id: string): string => db.branches.find((b) => b.id === id)?.name ?? id;

function addAlert(b: PackBuilder, a: UnifiedAlert): void {
  b.add(
    'A',
    'alert',
    a.title,
    `${PRIORITY_LABEL[a.priority]}; ${ALERT_STATUS_LABEL[a.status]}; ${SOURCE_LABEL[a.source]}. ${a.reason} Linked to ${a.linkedLabel}. Suggested next action: ${a.nextAction}`,
    `/alerts?alert=${encodeURIComponent(a.id)}`,
  );
}

function applicationPack(db: Db, app: Application): ContextPack {
  const b = packBuilder();
  const href = `/applications/${app.id}`;
  const priority = reviewPriority(app, db);
  b.add(
    'S',
    'subject',
    'Application',
    `${app.id} for ${appName(app)}: ${PRODUCT_LABEL[app.data.loan.product]} of ${formatMoney(app.data.loan.amountMinor)}. Status ${APP_STATUS_LABEL[app.status]}. Review priority ${priority === null ? 'not checked yet' : PRIORITY_LABEL[priority]}. ${branchName(db, app.branchId)}. Submitted ${formatDate(app.submittedAt)}.`,
    href,
  );
  if (app.data.loan.purpose.trim() !== '')
    b.add('S', 'subject', 'Stated purpose', app.data.loan.purpose, href);
  for (const f of [...runChecks(app, db)].sort(byPriority).slice(0, 12))
    addFinding(b, f, `${href}?tab=findings`);
  for (const d of applicationDocs(app, db).slice(0, 10)) {
    const reviewed = d.fields.filter((x) => x.state === 'confirmed' || x.state === 'corrected');
    b.add(
      'D',
      'document',
      docTypeLabel(d.docType),
      `${d.filename}: ${String(d.fields.length)} fields read, ${String(reviewed.length)} reviewed by a person.`,
      `${href}?tab=documents`,
    );
  }
  return b.done({ kind: 'application', title: `${app.id} · ${appName(app)}` });
}

function loanSubject(db: Db, b: PackBuilder, loan: Loan): void {
  const borrower = db.borrowers.find((x) => x.id === loan.borrowerId);
  b.add(
    'S',
    'subject',
    'Loan',
    `${loan.id} to ${borrower?.name ?? 'the borrower'}: ${PRODUCT_LABEL[loan.product]} of ${formatMoney(loan.amountMinor)} disbursed on ${formatDate(loan.disbursedAt)}. Stated purpose: ${loan.purpose}. Monitored for ${String(loan.monitoringDays)} days. Data source: ${loan.dataSource}.`,
    `/monitoring?loan=${encodeURIComponent(loan.id)}`,
  );
}

function loanPack(db: Db, loan: Loan): ContextPack {
  const b = packBuilder();
  const href = `/monitoring?loan=${encodeURIComponent(loan.id)}`;
  loanSubject(db, b, loan);
  const alerts = allAlerts(db).filter((a) => a.loanId === loan.id && isOpen(a.status));
  for (const a of [...alerts].sort(byPriority).slice(0, 8)) addAlert(b, a);
  const txns = db.transactions
    .filter((t) => t.loanId === loan.id)
    .sort((x, y) => x.at.localeCompare(y.at))
    .slice(0, 25);
  for (const t of txns) addTransaction(b, db, t, href);
  for (const e of db.publicWatches.find((w) => w.loanId === loan.id)?.events.slice(0, 8) ?? [])
    b.add(
      'R',
      'record',
      `${e.record.caseType} (${e.record.kind})`,
      `${e.record.title}. Record date ${e.record.date ?? 'not given'}; ${e.record.evidenceStatus}.`,
      '/monitoring/public-records',
    );
  const name = db.borrowers.find((x) => x.id === loan.borrowerId)?.name;
  return b.done({ kind: 'loan', title: name === undefined ? loan.id : `${loan.id} · ${name}` });
}

function alertPack(db: Db, a: UnifiedAlert): ContextPack {
  const b = packBuilder();
  const href = `/alerts?alert=${encodeURIComponent(a.id)}`;
  b.add(
    'S',
    'subject',
    'Alert',
    `${a.title}. ${PRIORITY_LABEL[a.priority]}; status ${ALERT_STATUS_LABEL[a.status]}; ${SOURCE_LABEL[a.source]}; ${a.category}. Linked to ${a.linkedLabel}. Raised ${formatDate(a.at)}.`,
    href,
  );
  b.add('A', 'alert', 'Why it was raised', a.reason, href);
  b.add('K', 'step', 'Suggested next action', a.nextAction, href);
  const m = a.monitoring;
  if (m !== null) {
    b.add(
      'M',
      'metric',
      'Monitoring rule',
      `${m.explanation} Threshold: ${m.threshold}. Window: ${m.window}. ${m.totalBasis}: ${formatMoney(m.totalMinor)}.`,
      href,
    );
    for (const t of db.transactions.filter((x) => m.transactionIds.includes(x.id)))
      addTransaction(b, db, t, href);
    for (const benign of m.benign.slice(0, 2))
      b.add('F', 'finding', 'Possible harmless reason', benign, href);
    for (const step of m.steps.slice(0, 3)) b.add('K', 'step', 'Check to do', step, href);
  }
  if (a.finding !== null) addFinding(b, a.finding, a.linkedHref);
  const loan = db.loans.find((l) => l.id === a.loanId);
  if (loan !== undefined) loanSubject(db, b, loan);
  return b.done({ kind: 'alert', title: a.title });
}

function borrowerPack(db: Db, id: string): ContextPack | null {
  const br = db.borrowers.find((x) => x.id === id);
  if (br === undefined) return null;
  const b = packBuilder();
  const href = `/borrowers/${br.id}`;
  b.add(
    'S',
    'subject',
    'Borrower',
    `${br.name}: ${BORROWER_TYPE_LABEL[br.type]}, ${branchName(db, br.branchId)}, relationship manager ${br.relationshipManager}, ${br.status}.${br.registrationNo === '' ? '' : ` Registration ${br.registrationNo}.`}`,
    href,
  );
  for (const l of db.loans.filter((x) => x.borrowerId === br.id).slice(0, 8))
    b.add(
      'L',
      'subject',
      `Loan ${l.id}`,
      `${PRODUCT_LABEL[l.product]} of ${formatMoney(l.amountMinor)} disbursed ${formatDate(l.disbursedAt)} for ${l.purpose}.`,
      `/monitoring?loan=${encodeURIComponent(l.id)}`,
    );
  for (const a of db.applications.filter((x) => x.borrowerId === br.id).slice(0, 6)) {
    const p = reviewPriority(a, db);
    b.add(
      'P',
      'subject',
      `Application ${a.id}`,
      `${PRODUCT_LABEL[a.data.loan.product]} of ${formatMoney(a.data.loan.amountMinor)}; ${APP_STATUS_LABEL[a.status]}; review priority ${p === null ? 'not checked yet' : PRIORITY_LABEL[p]}.`,
      `/applications/${a.id}`,
    );
  }
  const alerts = allAlerts(db).filter((a) => a.borrowerId === br.id && isOpen(a.status));
  for (const a of [...alerts].sort(byPriority).slice(0, 10)) addAlert(b, a);
  return b.done({ kind: 'borrower', title: br.name });
}

function casePack(db: Db, c: Case): ContextPack {
  const b = packBuilder();
  const href = `/investigations/${c.id}`;
  b.add(
    'S',
    'subject',
    'Case',
    `${c.id} · ${c.title}. ${PRIORITY_LABEL[c.priority]}; status ${CASE_STATUS_LABEL[c.status]}; owner ${c.owner}; opened ${formatDate(c.openedAt)}.`,
    href,
  );
  if (c.summary.trim() !== '') b.add('S', 'subject', 'Case summary', c.summary, href);
  for (const e of c.evidence.slice(0, 12))
    b.add(
      'E',
      'evidence',
      `${EVIDENCE_TYPE_LABEL[e.sourceType]} · ${e.sourceName}`,
      `${e.excerpt} (${EVIDENCE_STATUS_LABEL[e.status]}; reference ${e.reference}; collected ${formatDate(e.collectedAt)})`,
      `${href}?tab=evidence`,
    );
  const alerts = allAlerts(db).filter((a) => c.alertIds.includes(a.id));
  for (const a of [...alerts].sort(byPriority).slice(0, 8)) addAlert(b, a);
  for (const item of c.checklist.filter((x) => !x.done).slice(0, 6))
    b.add('K', 'step', 'Open checklist item', item.text, href);
  for (const n of c.notes.slice(-3))
    b.add('N', 'evidence', `Note by ${n.author}, ${formatDate(n.at)}`, n.text, `${href}?tab=notes`);
  return b.done({ kind: 'case', title: `${c.id} · ${c.title}` });
}

function portfolioPack(db: Db, me: string, scope: string): ContextPack {
  const b = packBuilder();
  const c = navCounts(db, me, scope);
  const where = scope === 'all' ? 'all branches' : branchName(db, scope);
  b.add(
    'S',
    'subject',
    'Portfolio',
    `${where}: ${String(c.applications.value)} applications awaiting review, ${String(c.alerts.value)} open alerts, ${String(c.pulse.total)} loans in the loan book (${String(c.loans.value)} with open alerts), ${String(c.cases.value)} open cases.`,
    '/dashboard',
  );
  b.add(
    'M',
    'metric',
    'Loan book by review priority',
    `${String(c.pulse.byPriority.routine)} routine review, ${String(c.pulse.byPriority.needs_attention)} needs attention, ${String(c.pulse.byPriority.urgent)} urgent review.`,
    '/monitoring',
  );
  const keep = (id: string): boolean => scope === 'all' || id === scope;
  const open = allAlerts(db).filter((a) => isOpen(a.status) && keep(a.branchId));
  for (const a of [...open].sort(byPriority).slice(0, 12)) addAlert(b, a);
  return b.done({ kind: 'portfolio', title: `Portfolio · ${where}` });
}

/** Builds the facts for a target, or null when the record no longer exists. */
export function buildContext(
  db: Db,
  target: CopilotTarget,
  me: string,
  scope: string,
): ContextPack | null {
  switch (target.kind) {
    case 'portfolio':
      return portfolioPack(db, me, scope);
    case 'application': {
      const app = db.applications.find((a) => a.id === target.id);
      return app === undefined ? null : applicationPack(db, app);
    }
    case 'loan': {
      const loan = db.loans.find((l) => l.id === target.id);
      return loan === undefined ? null : loanPack(db, loan);
    }
    case 'alert': {
      const a = allAlerts(db).find((x) => x.id === target.id);
      return a === undefined ? null : alertPack(db, a);
    }
    case 'borrower':
      return borrowerPack(db, target.id);
    case 'case': {
      const c = db.cases.find((x) => x.id === target.id);
      return c === undefined ? null : casePack(db, c);
    }
  }
}
