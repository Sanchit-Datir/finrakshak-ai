/**
 * Mutual exclusion for pipeline steps that read, merge and write shared state (B-48, B-51).
 * Leases expire, so a crashed holder never blocks the pipeline for longer than its TTL.
 */
export interface LeaseManager {
  /** Runs `fn` while holding `name`; throws `LeaseHeldError` if a live lease is held by another run. */
  withLease<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}

export class LeaseHeldError extends Error {
  constructor(
    readonly lease: string,
    readonly holder: string,
    readonly expiresAt: string,
  ) {
    super(`Lease ${lease} is held by ${holder} until ${expiresAt}`);
    this.name = 'LeaseHeldError';
  }
}
