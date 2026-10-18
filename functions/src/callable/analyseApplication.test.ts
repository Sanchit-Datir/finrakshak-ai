import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import type * as GeminiModule from '../services/gemini.js';
import { GeminiError } from '../services/gemini.js';
import { createRateLimiter } from '../services/rate-limit.js';
import { analyseApplicationHandler, type AnalyseApplicationDeps } from './analyseApplication.js';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions', () => ({ logger: log }));

const generateJson = vi.hoisted(() => vi.fn());
vi.mock('../services/gemini.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GeminiModule>()),
  generateJson,
}));

const INPUT = {
  borrowerType: 'individual',
  documents: [
    {
      docId: 'D1',
      docType: 'salary_slip',
      fields: [{ fieldId: 'F1', label: 'Net pay', value: '42,000', reviewed: true }],
    },
  ],
  findings: [{ findingId: 'X1', title: 'Income mismatch', priority: 'urgent', observed: '' }],
};
const NOW = new Date('2026-10-18T06:00:00.000Z');

const req = (data: unknown, signedIn = true): CallableRequest<unknown> =>
  ({
    data,
    auth: signedIn ? { uid: 'u1', token: {} } : undefined,
  }) as unknown as CallableRequest<unknown>;

function deps(allowed = true, limit = 1_000): AnalyseApplicationDeps & { used: () => number } {
  let calls = 0;
  return {
    usage: {
      tryIncrement: () => Promise.resolve(++calls),
    },
    access: { isAllowed: () => Promise.resolve(allowed) },
    limiter: createRateLimiter({ limit, windowMs: 60_000 }),
    now: () => NOW,
    used: () => calls,
  };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof HttpsError) return e.code;
    throw e;
  }
}

beforeEach(() => {
  resetEnvCache();
  generateJson.mockReset();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('analyseApplication', () => {
  it('requires sign-in', async () => {
    expect(await codeOf(analyseApplicationHandler(req(INPUT, false), deps()))).toBe(
      'unauthenticated',
    );
  });

  it('rejects malformed input', async () => {
    const bad = { ...INPUT, documents: 'nope' };
    expect(await codeOf(analyseApplicationHandler(req(bad), deps()))).toBe('invalid-argument');
  });

  it('applies the burst limit', async () => {
    const d = deps(true, 1);
    await analyseApplicationHandler(req(INPUT), d);
    expect(await codeOf(analyseApplicationHandler(req(INPUT), d))).toBe('resource-exhausted');
  });

  it('answers from the free mock without the stores or the model', async () => {
    const d = deps();
    const r = await analyseApplicationHandler(req(INPUT), d);
    expect(r).toMatchObject({ mock: true, model: null, remainingToday: null, dropped: 0 });
    expect(r.analysedAt).toBe(NOW.toISOString());
    expect(d.used()).toBe(0);
    expect(generateJson).not.toHaveBeenCalled();
  });

  describe('billed provider', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_PROVIDER', 'apikey');
      vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    });

    it('returns grounded output and counts one use', async () => {
      generateJson.mockResolvedValue(
        JSON.stringify({
          summary: 'Pay slip shows 42,000.',
          facts: [{ docId: 'D1', fieldId: 'F1', statement: 'Net pay 42,000' }],
          findingNotes: [{ findingId: 'X1', note: 'Compare with bank credits.' }],
        }),
      );
      const d = deps();
      const r = await analyseApplicationHandler(req(INPUT), d);
      expect(r).toMatchObject({ mock: false, model: 'gemini-3.1-flash-lite', dropped: 0 });
      expect(r.facts).toHaveLength(1);
      expect(d.used()).toBe(1);
      expect(JSON.stringify(log.info.mock.calls)).not.toContain('42,000');
    });

    it('retries once on a reply that is not JSON, then fails as retryable', async () => {
      generateJson.mockResolvedValue('not json');
      expect(await codeOf(analyseApplicationHandler(req(INPUT), deps()))).toBe('unavailable');
      expect(generateJson).toHaveBeenCalledTimes(2);
    });

    it('turns a model failure into a retryable error', async () => {
      generateJson.mockRejectedValue(new GeminiError('Gemini request failed'));
      expect(await codeOf(analyseApplicationHandler(req(INPUT), deps()))).toBe('unavailable');
    });

    it('refuses an account without AI access before any model call', async () => {
      expect(await codeOf(analyseApplicationHandler(req(INPUT), deps(false)))).toBe(
        'permission-denied',
      );
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('refuses oversized data without counting a use (B-10, B-15)', async () => {
      const doc = (i: number): object => ({
        docId: `D${String(i)}`,
        docType: 'other',
        fields: Array.from({ length: 30 }, (_, j) => ({
          fieldId: `F${String(j)}`,
          label: 'Label',
          value: 'v'.repeat(200),
          reviewed: true,
        })),
      });
      const big = { ...INPUT, documents: Array.from({ length: 12 }, (_, i) => doc(i)) };
      const d = deps();
      expect(await codeOf(analyseApplicationHandler(req(big), d))).toBe('invalid-argument');
      expect(d.used()).toBe(0);
    });
  });
});
