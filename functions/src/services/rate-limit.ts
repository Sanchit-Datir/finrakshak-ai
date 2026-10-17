export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds until the caller may try again (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

interface Window {
  start: number;
  count: number;
}

/**
 * A fixed-window counter held in memory: free and instant, no database. It is per function instance
 * (a few at most, see maxInstances), so the effective limit across all instances can be a few times
 * `limit`; that is fine for a burst brake. State is bounded: stale windows are dropped, and if an
 * attacker mints many accounts the oldest entries go first, so memory cannot grow without limit.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const maxKeys = options.maxKeys ?? 10_000;
  const windows = new Map<string, Window>();

  function makeRoom(now: number): void {
    if (windows.size < maxKeys) return;
    for (const [key, w] of windows) {
      if (now - w.start >= windowMs) windows.delete(key);
    }
    // Still full of live windows: evict the oldest (Map keeps insertion order).
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next();
      if (oldest.done === true) break;
      windows.delete(oldest.value);
    }
  }

  return {
    check(key, now = Date.now()) {
      let entry = windows.get(key);
      if (entry === undefined || now - entry.start >= windowMs) {
        makeRoom(now);
        windows.delete(key);
        entry = { start: now, count: 0 };
        windows.set(key, entry);
      }
      if (entry.count >= limit) {
        // A refused request is not counted, so hammering cannot extend the wait.
        const retryAfterSeconds = Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
      }
      entry.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
