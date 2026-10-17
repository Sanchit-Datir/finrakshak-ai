import { describe, expect, it } from 'vitest';
import { consumeDailyQuota, istDayKey, type UsageStore } from './usage-limit.js';

/** In-memory stand-in for the Firestore transaction, with the same contract. */
function memoryStore(): UsageStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    tryIncrement(uid, day, limit) {
      const key = `${uid}_${day}`;
      const count = counts.get(key) ?? 0;
      if (count >= limit) return Promise.resolve(undefined);
      counts.set(key, count + 1);
      return Promise.resolve(count + 1);
    },
  };
}

describe('istDayKey', () => {
  it('uses the Indian calendar day, not the UTC day', () => {
    // 19:00 UTC on 16 Oct is already 00:30 on 17 Oct in India.
    expect(istDayKey(new Date('2026-10-16T19:00:00Z'))).toBe('20261017');
    expect(istDayKey(new Date('2026-10-16T18:29:59Z'))).toBe('20261016');
  });
});

describe('consumeDailyQuota', () => {
  const now = new Date('2026-10-17T06:00:00Z');

  it('allows calls up to the limit and counts down', async () => {
    const store = memoryStore();
    expect(await consumeDailyQuota(store, 'u1', 3, now)).toEqual({ allowed: true, remaining: 2 });
    expect(await consumeDailyQuota(store, 'u1', 3, now)).toEqual({ allowed: true, remaining: 1 });
    expect(await consumeDailyQuota(store, 'u1', 3, now)).toEqual({ allowed: true, remaining: 0 });
  });

  it('refuses the call after the limit and does not keep counting', async () => {
    const store = memoryStore();
    for (let i = 0; i < 2; i += 1) await consumeDailyQuota(store, 'u1', 2, now);
    expect(await consumeDailyQuota(store, 'u1', 2, now)).toEqual({ allowed: false, remaining: 0 });
    expect(store.counts.get('u1_20261017')).toBe(2);
  });

  it('counts each user separately', async () => {
    const store = memoryStore();
    await consumeDailyQuota(store, 'u1', 1, now);
    expect((await consumeDailyQuota(store, 'u2', 1, now)).allowed).toBe(true);
    expect((await consumeDailyQuota(store, 'u1', 1, now)).allowed).toBe(false);
  });

  it('starts fresh the next Indian day', async () => {
    const store = memoryStore();
    await consumeDailyQuota(store, 'u1', 1, now);
    const tomorrow = new Date('2026-10-18T06:00:00Z');
    expect((await consumeDailyQuota(store, 'u1', 1, tomorrow)).allowed).toBe(true);
  });
});
