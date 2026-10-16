import type { AlertState, AlertStatus, Db, Priority } from '../domain/schemas.js';
import { CATEGORY_LABEL, runChecks, type Finding } from './checks.js';
import { RULES, runMonitoring, type MonitoringAlert } from './monitoring.js';

/** One list of alerts from both workspaces (spec §14). */
export interface UnifiedAlert {
  id: string;
  source: 'monitoring' | 'pre_disbursement';
  title: string;
  reason: string;
  category: string;
  priority: Priority;
  status: AlertStatus;
  assignee: string | null;
  at: string;
  branchId: string;
  borrowerId: string | null;
  loanId: string | null;
  applicationId: string | null;
  linkedLabel: string;
  linkedHref: string;
  nextAction: string;
  state: AlertState | undefined;
  monitoring: MonitoringAlert | null;
  finding: Finding | null;
}

export const SOURCE_LABEL: Record<UnifiedAlert['source'], string> = {
  monitoring: 'Transaction monitoring',
  pre_disbursement: 'Pre-disbursement checks',
};

const ACTIVE_APP = new Set(['documents_needed', 'processing', 'needs_review', 'ready_for_decision']);
const ALERTABLE: ReadonlySet<Finding['category']> = new Set([
  'counterparty_exposure',
  'document_inconsistency',
  'duplicate_identifier',
  'entity_relationship',
  'financial_mismatch',
  'collateral_conflict',
]);

const cache = new WeakMap<Db, UnifiedAlert[]>();

export function allAlerts(db: Db): UnifiedAlert[] {
  const hit = cache.get(db);
  if (hit !== undefined) return hit;
  const loans = new Map(db.loans.map((l) => [l.id, l]));
  const borrowers = new Map(db.borrowers.map((b) => [b.id, b]));
  const out: UnifiedAlert[] = [];

  for (const m of runMonitoring(db)) {
    const loan = loans.get(m.loanId);
    const state = db.alertStates[m.id];
    out.push({
      id: m.id,
      source: 'monitoring',
      title: m.title,
      reason: RULES[m.ruleId].name,
      category: RULES[m.ruleId].name,
      priority: m.priority,
      status: state?.status ?? 'new',
      assignee: state?.assignee ?? null,
      at: m.detectedAt,
      branchId: loan?.branchId ?? '',
      borrowerId: loan?.borrowerId ?? null,
      loanId: m.loanId,
      applicationId: loan?.applicationId ?? null,
      linkedLabel: `${m.loanId} · ${borrowers.get(loan?.borrowerId ?? '')?.name ?? ''}`,
      linkedHref: `/monitoring?loan=${encodeURIComponent(m.loanId)}`,
      nextAction: m.steps[0] ?? 'Review evidence',
      state,
      monitoring: m,
      finding: null,
    });
  }

  for (const app of db.applications) {
    if (!ACTIVE_APP.has(app.status) || app.checksRunAt === null) continue;
    for (const f of runChecks(app, db)) {
      if (f.priority === 'routine' || !ALERTABLE.has(f.category)) continue;
      const fs = app.findingStates[f.id]?.status;
      if (fs === 'resolved' || fs === 'not_an_issue') continue;
      const id = `app:${f.id}`;
      const state = db.alertStates[id];
      out.push({
        id,
        source: 'pre_disbursement',
        title: f.title,
        reason: f.observed,
        category: CATEGORY_LABEL[f.category],
        priority: f.priority,
        status: state?.status ?? 'new',
        assignee: state?.assignee ?? null,
        at: app.checksRunAt,
        branchId: app.branchId,
        borrowerId: app.borrowerId,
        loanId: null,
        applicationId: app.id,
        linkedLabel: `${app.id} · ${app.data.applicant.fullName || app.data.business.businessName}`,
        linkedHref: `/applications/${app.id}?tab=findings`,
        nextAction: f.steps[0] ?? 'Review evidence',
        state,
        monitoring: null,
        finding: f,
      });
    }
  }

  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  cache.set(db, out);
  return out;
}

export function isOpen(status: AlertStatus): boolean {
  return status === 'new' || status === 'in_review' || status === 'escalated';
}
