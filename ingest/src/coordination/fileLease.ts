import { dataPath } from '../config.js';
import { withLock } from '../delta/lock.js';
import type { LeaseManager } from './lease.js';

/**
 * Lock files under data/interim for a single machine (local CLI and development). Staleness is
 * handled by `withLock` (12 h); the TTL argument is not needed on one machine.
 */
export class FileLeaseManager implements LeaseManager {
  withLease<T>(name: string, _ttlMs: number, fn: () => Promise<T>): Promise<T> {
    return withLock(dataPath('interim', `${name}.lock`), fn);
  }
}
