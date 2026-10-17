import { Timestamp, type Firestore } from '@google-cloud/firestore';
import { z } from 'zod';
import { log } from '../log.js';
import { LeaseHeldError, type LeaseManager } from './lease.js';

export const LEASE_COLLECTION = 'ingestLocks';

const LeaseDocSchema = z.object({
  holder: z.string(),
  acquired_at: z.string().datetime(),
  expiresAt: z.instanceof(Timestamp),
});

/**
 * Leases as Firestore documents (`ingestLocks/{name}`), taken and released in transactions, so
 * parallel Cloud Run tasks and overlapping executions exclude each other. `expiresAt` is a
 * Timestamp so a Firestore TTL policy can delete leases left by crashed runs.
 */
export class FirestoreLeaseManager implements LeaseManager {
  constructor(
    private readonly db: Firestore,
    /** Identifies this holder in the lease document (run id + task index). */
    private readonly holder: string,
  ) {}

  async withLease<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    await this.acquire(name, ttlMs);
    try {
      return await fn();
    } finally {
      await this.release(name);
    }
  }

  private async acquire(name: string, ttlMs: number): Promise<void> {
    const ref = this.db.collection(LEASE_COLLECTION).doc(name);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      if (snap.exists) {
        const held = LeaseDocSchema.safeParse(snap.data());
        if (held.success && held.data.holder !== this.holder) {
          if (held.data.expiresAt.toMillis() > now)
            throw new LeaseHeldError(
              name,
              held.data.holder,
              held.data.expiresAt.toDate().toISOString(),
            );
          log.warn('taking over an expired lease', { lease: name, previous: held.data.holder });
        }
      }
      tx.set(ref, {
        holder: this.holder,
        acquired_at: new Date(now).toISOString(),
        expiresAt: Timestamp.fromMillis(now + ttlMs),
      });
    });
  }

  private async release(name: string): Promise<void> {
    const ref = this.db.collection(LEASE_COLLECTION).doc(name);
    try {
      await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const held = LeaseDocSchema.safeParse(snap.data());
        if (held.success && held.data.holder === this.holder) tx.delete(ref);
      });
    } catch (e) {
      // The lease still expires on its own; a failed release must not fail the finished work.
      log.warn('lease release failed', {
        lease: name,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }
}
