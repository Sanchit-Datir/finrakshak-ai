import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Per-user daily cap on billed AI calls (B-15). Counters live in the `usage` collection, which
 * clients cannot read or write (default-deny rules); only this server code, via the Admin SDK, can.
 */
export interface UsageStore {
  /** Atomically add one use for (uid, day). Returns the new count, or undefined if `limit` is reached. */
  tryIncrement(uid: string, day: string, limit: number): Promise<number | undefined>;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar day in India Standard Time (UTC+5:30, no DST) as YYYYMMDD. A "day" is an Indian day (B-27). */
export function istDayKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10).replaceAll('-', '');
}

export function firestoreUsageStore(): UsageStore {
  return {
    async tryIncrement(uid, day, limit) {
      const db = getFirestore();
      const ref = db.collection('usage').doc(`${uid}_${day}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const raw: unknown = snap.get('count');
        const count = typeof raw === 'number' ? raw : 0;
        if (count >= limit) return undefined;
        tx.set(ref, { uid, day, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
        return count + 1;
      });
    },
  };
}

export interface QuotaResult {
  allowed: boolean;
  /** Calls left today after this one (0 when refused). */
  remaining: number;
}

/** Counts this call against today's limit. The count is not refunded if the model call then fails. */
export async function consumeDailyQuota(
  store: UsageStore,
  uid: string,
  limit: number,
  now: Date = new Date(),
): Promise<QuotaResult> {
  const used = await store.tryIncrement(uid, istDayKey(now), limit);
  return used === undefined
    ? { allowed: false, remaining: 0 }
    : { allowed: true, remaining: limit - used };
}
