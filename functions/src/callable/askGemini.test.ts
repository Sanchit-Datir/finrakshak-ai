import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import type * as GeminiModule from '../services/gemini.js';
import { GeminiError } from '../services/gemini.js';
import type { UsageStore } from '../services/usage-limit.js';
import { askGeminiHandler } from './askGemini.js';

const generateText = vi.hoisted(() => vi.fn());
vi.mock('../services/gemini.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GeminiModule>()),
  generateText,
}));

function req(data: unknown, signedIn = true): CallableRequest<unknown> {
  return {
    data,
    auth: signedIn ? { uid: 'u1', token: {} } : undefined,
  } as unknown as CallableRequest<unknown>;
}

/** Never touched by mock-provider tests; fails loudly if the handler uses it. */
const untouchedStore: UsageStore = {
  tryIncrement: () => Promise.reject(new Error('usage store must not be used with the mock')),
};

function limitedStore(allowedCalls: number): UsageStore & { calls: number } {
  const store = {
    calls: 0,
    tryIncrement(_uid: string, _day: string, limit: number): Promise<number | undefined> {
      if (store.calls >= Math.min(allowedCalls, limit)) return Promise.resolve(undefined);
      store.calls += 1;
      return Promise.resolve(store.calls);
    },
  };
  return store;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpsError) return error.code;
    throw error;
  }
  return 'ok';
}

beforeEach(() => {
  resetEnvCache();
  generateText.mockReset();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('askGeminiHandler (mock provider, the default under test)', () => {
  it('rejects unauthenticated callers before doing anything', async () => {
    expect(await codeOf(askGeminiHandler(req({ prompt: 'hi' }, false), untouchedStore))).toBe(
      'unauthenticated',
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([{}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }, { prompt: 'a'.repeat(8_001) }])(
    'rejects invalid input %j',
    async (data) => {
      expect(await codeOf(askGeminiHandler(req(data), untouchedStore))).toBe('invalid-argument');
      expect(generateText).not.toHaveBeenCalled();
    },
  );

  it('returns the text, flags it as mock, and applies no daily limit', async () => {
    generateText.mockResolvedValue('hello');
    await expect(
      askGeminiHandler(req({ prompt: '  say hello ' }), untouchedStore),
    ).resolves.toEqual({ text: 'hello', mock: true, remainingToday: null });
    expect(generateText).toHaveBeenCalledWith('say hello');
  });

  it('maps Gemini failures to a retryable error without leaking details', async () => {
    generateText.mockRejectedValue(new GeminiError('secret internal detail'));
    const error = await askGeminiHandler(req({ prompt: 'hi' }), untouchedStore).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('unavailable');
    expect((error as HttpsError).message).not.toContain('secret internal detail');
  });
});

describe('askGeminiHandler (billed provider: per-user daily limit)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_PROVIDER', 'apikey');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    vi.stubEnv('GEMINI_DAILY_LIMIT', '2');
    generateText.mockResolvedValue('real reply');
  });

  it('counts calls and reports how many are left', async () => {
    const store = limitedStore(10);
    expect(await askGeminiHandler(req({ prompt: 'a' }), store)).toEqual({
      text: 'real reply',
      mock: false,
      remainingToday: 1,
    });
    expect((await askGeminiHandler(req({ prompt: 'b' }), store)).remainingToday).toBe(0);
  });

  it('refuses once the limit is reached and never calls the model', async () => {
    const store = limitedStore(1);
    await askGeminiHandler(req({ prompt: 'a' }), store);
    generateText.mockClear();
    expect(await codeOf(askGeminiHandler(req({ prompt: 'b' }), store))).toBe('resource-exhausted');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not spend quota on unauthenticated or invalid requests', async () => {
    const store = limitedStore(10);
    await codeOf(askGeminiHandler(req({ prompt: 'a' }, false), store));
    await codeOf(askGeminiHandler(req({ prompt: '' }), store));
    expect(store.calls).toBe(0);
  });
});
