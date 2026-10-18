import { getFirestore } from 'firebase-admin/firestore';
import type { RiskAlertDoc, RiskExplanationDoc, RiskLatestDoc } from '@finrakshak-ai/shared';
import { z } from 'zod';

/**
 * Reads the synthetic risk scores for the getRiskScores callable (REMAINING_WORK.md, W3b). The job
 * writes `synthRiskLatest` and `synthRiskAlerts`; clients have no access to either, so this service is
 * the only way in. The web app parses every item fully with the shared schemas; here a narrow schema
 * checks the fields that decide who may see a document (functions deploy without workspace packages).
 */

export const LATEST_COLLECTION = 'synthRiskLatest';
export const ALERTS_COLLECTION = 'synthRiskAlerts';
/** The risk explainer's sentences, one per alert (RISK_EXPLAINER_PLAN.md; B-62). */
export const EXPLANATIONS_COLLECTION = 'synthRiskExplanations';
/** Most documents one call returns (Firestore reads are billed per document, B-15). */
export const SCORES_PAGE = 500;
export const ALERTS_PAGE = 200;

const Scoped = z
  .object({
    loan_id: z.string().min(1),
    branch_id: z.string().min(1),
    synthetic: z.literal(true),
  })
  .passthrough();

type AssertTrue<T extends true> = T;
export type LatestInSync = AssertTrue<RiskLatestDoc extends z.infer<typeof Scoped> ? true : false>;
export type AlertInSync = AssertTrue<RiskAlertDoc extends z.infer<typeof Scoped> ? true : false>;

const ExplanationScoped = Scoped.extend({ alert_id: z.string().min(1) });
export type ExplanationInSync = AssertTrue<
  RiskExplanationDoc extends z.infer<typeof ExplanationScoped> ? true : false
>;

/** Who the caller may see: every branch, or one. */
export type Scope =
  { readonly kind: 'all' } | { readonly kind: 'branch'; readonly branchId: string };

/**
 * Owner's decision (17 Oct 2026): for now everyone with a usable profile sees every branch's synthetic
 * scores. Branch scoping stays supported here (a `branch` scope) for when that decision is revisited.
 */
export const RISK_SCORES_SCOPE: Scope = { kind: 'all' };

export interface RiskQuery {
  readonly scope: Scope;
  readonly loanId: string | null;
}

export interface RiskScoreReader {
  /** Raw documents, at most `limit`. */
  latest(q: RiskQuery, limit: number): Promise<unknown[]>;
  alerts(q: RiskQuery, limit: number): Promise<unknown[]>;
  /** Raw explanation documents of these alerts (missing ones are left out). */
  explanations(alertIds: readonly string[]): Promise<unknown[]>;
}

export interface RiskScoresResult {
  scores: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  /** AI-written sentences for the returned alerts only, labelled as such in the app. */
  explanations: Record<string, unknown>[];
  truncated: boolean;
  /** Documents dropped because they were malformed or outside the caller's scope. */
  skipped: number;
}

/** The alert state the job carries between runs; it never leaves the server. */
const SERVER_ONLY: ReadonlySet<string> = new Set(['state', 'previous']);

const inScope = (scope: Scope, doc: z.infer<typeof Scoped>): boolean =>
  scope.kind === 'all' || doc.branch_id === scope.branchId;

/** Parses, re-checks the scope (defence in depth) and drops the server-only alert state. */
function visible(
  docs: readonly unknown[],
  scope: Scope,
): { items: Record<string, unknown>[]; skipped: number } {
  const items: Record<string, unknown>[] = [];
  for (const raw of docs) {
    const parsed = Scoped.safeParse(raw);
    if (!parsed.success || !inScope(scope, parsed.data)) continue;
    items.push(
      Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !SERVER_ONLY.has(k))),
    );
  }
  return { items, skipped: docs.length - items.length };
}

/** Explanations of returned alerts only, in scope, without the input hash. */
function visibleExplanations(
  docs: readonly unknown[],
  scope: Scope,
  alertIds: ReadonlySet<string>,
): Record<string, unknown>[] {
  return docs.flatMap((raw) => {
    const parsed = ExplanationScoped.safeParse(raw);
    if (!parsed.success || !inScope(scope, parsed.data) || !alertIds.has(parsed.data.alert_id))
      return [];
    return [Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k !== 'input_hash'))];
  });
}

export async function readRiskScores(
  reader: RiskScoreReader,
  q: RiskQuery,
): Promise<RiskScoresResult> {
  const [latest, alerts] = await Promise.all([
    reader.latest(q, SCORES_PAGE + 1),
    reader.alerts(q, ALERTS_PAGE + 1),
  ]);
  const truncated = latest.length > SCORES_PAGE || alerts.length > ALERTS_PAGE;
  const s = visible(latest.slice(0, SCORES_PAGE), q.scope);
  const a = visible(alerts.slice(0, ALERTS_PAGE), q.scope);
  const ids = a.items.flatMap((x) => (typeof x['alert_id'] === 'string' ? [x['alert_id']] : []));
  const explanations = visibleExplanations(await reader.explanations(ids), q.scope, new Set(ids));
  return {
    scores: s.items,
    alerts: a.items,
    explanations,
    truncated,
    skipped: s.skipped + a.skipped,
  };
}

export const firestoreRiskReader: RiskScoreReader = {
  async latest(q, limit) {
    const col = getFirestore().collection(LATEST_COLLECTION);
    if (q.loanId !== null) {
      const snap = await col.doc(q.loanId).get();
      return snap.exists ? [snap.data()] : [];
    }
    const query = q.scope.kind === 'all' ? col : col.where('branch_id', '==', q.scope.branchId);
    return (await query.limit(limit).get()).docs.map((d) => d.data());
  },
  async alerts(q, limit) {
    const col = getFirestore().collection(ALERTS_COLLECTION);
    if (q.loanId !== null) {
      // One loan has few alerts; the scope is checked on every document after the read.
      return (await col.where('loan_id', '==', q.loanId).limit(limit).get()).docs.map((d) =>
        d.data(),
      );
    }
    // Composite index (branch_id, created_at desc) in firestore.indexes.json.
    const scoped = q.scope.kind === 'all' ? col : col.where('branch_id', '==', q.scope.branchId);
    return (await scoped.orderBy('created_at', 'desc').limit(limit).get()).docs.map((d) =>
      d.data(),
    );
  },
  async explanations(alertIds) {
    if (alertIds.length === 0) return [];
    const db = getFirestore();
    const col = db.collection(EXPLANATIONS_COLLECTION);
    // One read per returned alert at most (ALERTS_PAGE), billed per document (B-15).
    const snaps = await db.getAll(...alertIds.map((id) => col.doc(id)));
    return snaps.filter((d) => d.exists).map((d) => d.data());
  },
};
