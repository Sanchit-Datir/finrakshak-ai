import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('createRateLimiter', () => {
  it('allows up to the limit, then refuses with a wait time', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) expect(limiter.check('u1', t0 + i).allowed).toBe(true);
    expect(limiter.check('u1', t0 + 10_000)).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it('counts each person separately', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check('u1', 0).allowed).toBe(true);
    expect(limiter.check('u2', 0).allowed).toBe(true);
    expect(limiter.check('u1', 1).allowed).toBe(false);
  });

  it('starts a fresh window once the old one has passed', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check('u1', 0).allowed).toBe(true);
    expect(limiter.check('u1', 59_999).allowed).toBe(false);
    expect(limiter.check('u1', 60_000).allowed).toBe(true);
  });

  it('does not extend the wait when someone keeps hammering', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check('u1', 0);
    for (let t = 1_000; t < 50_000; t += 1_000) limiter.check('u1', t);
    expect(limiter.check('u1', 60_000).allowed).toBe(true);
  });

  it('always reports at least one second to wait', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check('u1', 0);
    expect(limiter.check('u1', 59_999).retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('keeps memory bounded when many accounts appear: oldest entries are evicted', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const key of ['a', 'b', 'c', 'd', 'e']) limiter.check(key, 0);
    // 'a' was evicted to make room, so it starts a fresh window instead of being remembered...
    expect(limiter.check('a', 1).allowed).toBe(true);
    // ...while a recent key is still remembered.
    expect(limiter.check('e', 1).allowed).toBe(false);
  });

  it('drops expired windows first when it needs room', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    limiter.check('old1', 0);
    limiter.check('old2', 0);
    limiter.check('fresh', 5_000); // both old windows expired, so no live entry is evicted
    expect(limiter.check('fresh', 5_001).allowed).toBe(false);
  });
});
