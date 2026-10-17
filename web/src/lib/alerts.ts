import {
  RISK_BAND_LABELS,
  reasonText,
  type RaisedAlertKind,
  type RiskAlertDoc,
} from '@fund-tracker/shared';
import type { AlertState, AlertStatus, Db, Priority } from '../domain/schemas.js';
import { CATEGORY_LABEL, runChecks, type Finding } from './checks.js';
import { RULES, runMonitoring, type MonitoringAlert } from './monitoring.js';
import { watchFinding } from './public-watch.js';

/** One list of alerts from both workspaces (spec §14). */
export interface UnifiedAlert {
  id: string;
  source: 'monitoring' | 'pre_disbursement' | 'public_records' | 'risk_score';
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
  public_records: 'Public-records watch',
  risk_score: 'Risk score (synthetic)',
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

  out.push(...watchAlerts(db));
  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  cache.set(db, out);
  return out;
}

/** One alert per public record raised by a post-disbursement watch. */
function watchAlerts(db: Db): UnifiedAlert[] {
  return db.publicWatches.flatMap((w) =>
    w.events.map((ev): UnifiedAlert => {
      const f = watchFinding(w, ev);
      const state = db.alertStates[f.id];
      return {
        id: f.id,
        source: 'public_records',
        title: f.title,
        reason: f.observed,
        category: CATEGORY_LABEL[f.category],
        priority: f.priority,
        status: state?.status ?? 'new',
        assignee: state?.assignee ?? null,
        at: ev.raisedAt,
        branchId: w.branchId,
        borrowerId: null,
        loanId: null,
        applicationId: null,
        linkedLabel: `${w.loanRef} · ${w.borrowerName}`,
        linkedHref: `/monitoring/public-records?watch=${encodeURIComponent(w.id)}`,
        nextAction: f.steps[0] ?? 'Review evidence',
        state,
        monitoring: null,
        finding: f,
      };
    }),
  );
}

const RISK_ALERT_TITLE: Record<RaisedAlertKind, string> = {
  band_up: 'Risk band went up',
  rise_with_new_reason: 'Risk score rose with a new reason',
  override: 'Public record after disbursement',
  initial: 'First risk score above Routine review',
};

/**
 * Alerts of the synthetic risk-scoring job (REMAINING_WORK.md, W3d). They are SYNTH loans, not the demo
 * loan book, so they link to the risk scores page; status changes are kept locally like other alerts.
 */
export function riskScoreAlerts(db: Db, alerts: readonly RiskAlertDoc[]): UnifiedAlert[] {
  return alerts.map((a): UnifiedAlert => {
    const id = `risk:${a.alert_id}`;
    const state = db.alertStates[id];
    const [first] = a.reasons;
    return {
      id,
      source: 'risk_score',
      title: `${RISK_ALERT_TITLE[a.kind]}: ${RISK_BAND_LABELS[a.band]} (SYNTH)`,
      reason: first === undefined ? `Score ${a.score}` : reasonText(first),
      category: 'Synthetic risk score',
      priority: a.band,
      status: state?.status ?? 'new',
      assignee: state?.assignee ?? null,
      at: a.created_at,
      branchId: a.branch_id,
      borrowerId: null,
      loanId: null,
      applicationId: null,
      linkedLabel: `${a.loan_id} · SYNTH test loan`,
      linkedHref: `/monitoring/risk-scores?loan=${encodeURIComponent(a.loan_id)}`,
      nextAction: 'Review the reasons and the evidence behind them',
      state,
      monitoring: null,
      finding: null,
    };
  });
}

export function isOpen(status: AlertStatus): boolean {
  return status === 'new' || status === 'in_review' || status === 'escalated';
}
