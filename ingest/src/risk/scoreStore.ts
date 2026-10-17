import type { Firestore } from '@google-cloud/firestore';
import {
  RISK_ALERTS_COLLECTION,
  RISK_LATEST_COLLECTION,
  RiskAlertDocSchema,
  RiskLatestDocSchema,
  type RiskAlertDoc,
  type RiskLatestDoc,
} from '@fund-tracker/shared';
import { log } from '../log.js';

/**
 * Where the daily scoring job keeps each loan's latest score and alert state, and its alerts
 * (REMAINING_WORK.md, W2e). Firestore in the cloud; memory in tests. The job writes only these two
 * collections (question Q6: a test lists them). Alerts are created once and never rewritten (B-57).
 */
export interface RiskStateStore {
  /** Latest documents by loan id. A malformed document is skipped and counted, never acted on. */
  readLatest(): Promise<{ docs: Map<string, RiskLatestDoc>; malformed: number }>;
  /** Creates alerts that do not exist yet; returns how many were new. */
  createAlerts(alerts: readonly RiskAlertDoc[]): Promise<number>;
  writeLatest(docs: readonly RiskLatestDoc[]): Promise<void>;
}

/** The only collections the scoring job may write (Q6). */
export const SCORER_COLLECTIONS = [RISK_LATEST_COLLECTION, RISK_ALERTS_COLLECTION] as const;

/** B-20: Firestore allows 500 writes per batch; stay well under it. */
const BATCH = 400;
const MAX_LATEST_DOCS = 20_000;

const ALREADY_EXISTS = 6;
const isAlreadyExists = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === ALREADY_EXISTS;

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

export class FirestoreRiskStore implements RiskStateStore {
  constructor(private readonly db: Firestore) {}

  async readLatest(): Promise<{ docs: Map<string, RiskLatestDoc>; malformed: number }> {
    const snap = await this.db.collection(RISK_LATEST_COLLECTION).limit(MAX_LATEST_DOCS).get();
    const docs = new Map<string, RiskLatestDoc>();
    let malformed = 0;
    for (const d of snap.docs) {
      const parsed = RiskLatestDocSchema.safeParse(d.data());
      if (parsed.success && parsed.data.loan_id === d.id) docs.set(d.id, parsed.data);
      else malformed++;
    }
    if (malformed > 0) log.warn('malformed risk documents skipped', { malformed });
    return { docs, malformed };
  }

  async createAlerts(alerts: readonly RiskAlertDoc[]): Promise<number> {
    let created = 0;
    for (const group of chunks(alerts, 50)) {
      const results = await Promise.all(
        group.map(async (a) => {
          try {
            await this.db
              .collection(RISK_ALERTS_COLLECTION)
              .doc(a.alert_id)
              .create(RiskAlertDocSchema.parse(a));
            return 1;
          } catch (e) {
            // A retried run creates the same alert id again: keep the first, never rewrite it (B-57).
            if (isAlreadyExists(e)) return 0;
            throw e;
          }
        }),
      );
      created += results.reduce((s: number, n) => s + n, 0);
    }
    return created;
  }

  async writeLatest(docs: readonly RiskLatestDoc[]): Promise<void> {
    for (const group of chunks(docs, BATCH)) {
      const batch = this.db.batch();
      for (const d of group)
        batch.set(
          this.db.collection(RISK_LATEST_COLLECTION).doc(d.loan_id),
          RiskLatestDocSchema.parse(d),
        );
      await batch.commit();
    }
  }
}

/** In-memory store for tests and local runs. */
export class MemoryRiskStore implements RiskStateStore {
  readonly latest = new Map<string, RiskLatestDoc>();
  readonly alerts = new Map<string, RiskAlertDoc>();

  readLatest(): Promise<{ docs: Map<string, RiskLatestDoc>; malformed: number }> {
    return Promise.resolve({ docs: new Map(this.latest), malformed: 0 });
  }

  createAlerts(alerts: readonly RiskAlertDoc[]): Promise<number> {
    return Promise.resolve().then(() => {
      const fresh = alerts.filter((a) => !this.alerts.has(a.alert_id));
      for (const a of fresh) this.alerts.set(a.alert_id, RiskAlertDocSchema.parse(a));
      return fresh.length;
    });
  }

  writeLatest(docs: readonly RiskLatestDoc[]): Promise<void> {
    return Promise.resolve().then(() => {
      for (const d of docs) this.latest.set(d.loan_id, RiskLatestDocSchema.parse(d));
    });
  }
}
