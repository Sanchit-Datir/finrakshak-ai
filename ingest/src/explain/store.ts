import {
  RISK_ALERTS_COLLECTION,
  RISK_EXPLANATIONS_COLLECTION,
  RiskAlertDocSchema,
  RiskExplanationDocSchema,
  type RiskAlertDoc,
  type RiskExplanationDoc,
} from '@finrakshak-ai/shared';
import type { Firestore } from '@google-cloud/firestore';
import { log } from '../log.js';

/**
 * What the explainer reads and writes (RISK_EXPLAINER_PLAN.md, design 6): it reads alerts and creates
 * explanations beside them. It never writes an alert, a score, a band or a reason (B-57, B-62).
 */
export interface ExplainStore {
  /** Alerts the scoring job raised in this run, at most `limit`; malformed ones are skipped. */
  alertsOfRun(runId: string, limit: number): Promise<RiskAlertDoc[]>;
  /** Which of these alerts already have an explanation. */
  explained(alertIds: readonly string[]): Promise<Set<string>>;
  /** Creates the explanation unless one exists; returns true when it was new. */
  create(doc: RiskExplanationDoc): Promise<boolean>;
}

/** The only collection the explainer writes. */
export const EXPLAINER_COLLECTIONS = [RISK_EXPLANATIONS_COLLECTION] as const;

const ALREADY_EXISTS = 6;
const isAlreadyExists = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === ALREADY_EXISTS;

export class FirestoreExplainStore implements ExplainStore {
  constructor(private readonly db: Firestore) {}

  async alertsOfRun(runId: string, limit: number): Promise<RiskAlertDoc[]> {
    const snap = await this.db
      .collection(RISK_ALERTS_COLLECTION)
      .where('run_id', '==', runId)
      .limit(limit)
      .get();
    const alerts = snap.docs.flatMap((d) => {
      const parsed = RiskAlertDocSchema.safeParse(d.data());
      return parsed.success ? [parsed.data] : [];
    });
    if (alerts.length < snap.size)
      log.warn('malformed alerts skipped', { skipped: snap.size - alerts.length });
    return alerts;
  }

  async explained(alertIds: readonly string[]): Promise<Set<string>> {
    if (alertIds.length === 0) return new Set();
    const col = this.db.collection(RISK_EXPLANATIONS_COLLECTION);
    const snaps = await this.db.getAll(...alertIds.map((id) => col.doc(id)));
    return new Set(snaps.filter((s) => s.exists).map((s) => s.id));
  }

  async create(doc: RiskExplanationDoc): Promise<boolean> {
    try {
      // `create`, never `set`: an explanation is written once (B-24).
      await this.db
        .collection(RISK_EXPLANATIONS_COLLECTION)
        .doc(doc.alert_id)
        .create(RiskExplanationDocSchema.parse(doc));
      return true;
    } catch (e) {
      if (isAlreadyExists(e)) return false;
      throw e;
    }
  }
}

/** In memory, for tests and local runs. */
export class MemoryExplainStore implements ExplainStore {
  readonly explanations = new Map<string, RiskExplanationDoc>();

  constructor(readonly alerts: readonly RiskAlertDoc[] = []) {}

  alertsOfRun(runId: string, limit: number): Promise<RiskAlertDoc[]> {
    return Promise.resolve(this.alerts.filter((a) => a.run_id === runId).slice(0, limit));
  }

  explained(alertIds: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(alertIds.filter((id) => this.explanations.has(id))));
  }

  create(doc: RiskExplanationDoc): Promise<boolean> {
    return Promise.resolve().then(() => {
      if (this.explanations.has(doc.alert_id)) return false;
      this.explanations.set(doc.alert_id, RiskExplanationDocSchema.parse(doc));
      return true;
    });
  }
}
