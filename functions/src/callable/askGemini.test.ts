import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import type { AccessStore } from '../services/access.js';
import type * as GeminiModule from '../services/gemini.js';
import { GeminiError } from '../services/gemini.js';
import type { UsageStore } from '../services/usage-limit.js';
import { askGeminiHandler, type AskGeminiDeps } from './askGemini.js';

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

/** Never touched by mock-provider tests; fails loudly if the handler uses either store. */
const untouchedDeps: AskGeminiDeps = {
  usage: { tryIncrement: () => Promise.reject(new Error('usage store must not be used')) },
  access: { isAllowed: () => Promise.reject(new Error('access store must not be used')) },
};

interface CountingDeps extends AskGeminiDeps {
  usage: UsageStore & { calls: number };
  access: AccessStore & { checks: number };
}

function depsFor(options: { allowed: boolean; allowedCalls?: number }): CountingDeps {
  const allowedCalls = options.allowedCalls ?? 100;
  const usage = {
    calls: 0,
    tryIncrement(_uid: string, _day: string, limit: number): Promise<number | undefined> {
      if (usage.calls >= Math.min(allowedCalls, limit)) return Promise.resolve(undefined);
      usage.calls += 1;
      return Promise.resolve(usage.calls);
    },
  };
  const access = {
    checks: 0,
    isAllowed(): Promise<boolean> {
      access.checks += 1;
      return Promise.resolve(options.allowed);
    },
  };
  return { usage, access };
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
    expect(await codeOf(askGeminiHandler(req({ prompt: 'hi' }, false), untouchedDeps))).toBe(
      'unauthenticated',
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([{}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }, { prompt: 'a'.repeat(8_001) }])(
    'rejects invalid input %j',
    async (data) => {
      expect(await codeOf(askGeminiHandler(req(data), untouchedDeps))).toBe('invalid-argument');
      expect(generateText).not.toHaveBeenCalled();
    },
  );

  it('returns the text, flags it as mock, and needs no allow-list or daily limit', async () => {
    generateText.mockResolvedValue('hello');
    await expect(askGeminiHandler(req({ prompt: '  say hello ' }), untouchedDeps)).resolves.toEqual(
      { text: 'hello', mock: true, remainingToday: null },
    );
    expect(generateText).toHaveBeenCalledWith('say hello');
  });

  it('maps Gemini failures to a retryable error without leaking details', async () => {
    generateText.mockRejectedValue(new GeminiError('secret internal detail'));
    const error = await askGeminiHandler(req({ prompt: 'hi' }), untouchedDeps).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('unavailable');
    expect((error as HttpsError).message).not.toContain('secret internal detail');
  });
});

describe('askGeminiHandler (billed provider: allow-list, then daily limit)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_PROVIDER', 'apikey');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    vi.stubEnv('GEMINI_DAILY_LIMIT', '2');
    generateText.mockResolvedValue('real reply');
  });

  it('serves an allowed user, counting calls and reporting how many are left', async () => {
    const deps = depsFor({ allowed: true });
    expect(await askGeminiHandler(req({ prompt: 'a' }), deps)).toEqual({
      text: 'real reply',
      mock: false,
      remainingToday: 1,
    });
    expect((await askGeminiHandler(req({ prompt: 'b' }), deps)).remainingToday).toBe(0);
  });

  it('refuses an account that is not on the allow-list, before any quota or model use', async () => {
    const deps = depsFor({ allowed: false });
    expect(await codeOf(askGeminiHandler(req({ prompt: 'a' }), deps))).toBe('permission-denied');
    expect(deps.usage.calls).toBe(0);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('refuses once the daily limit is reached and never calls the model', async () => {
    const deps = depsFor({ allowed: true, allowedCalls: 1 });
    await askGeminiHandler(req({ prompt: 'a' }), deps);
    generateText.mockClear();
    expect(await codeOf(askGeminiHandler(req({ prompt: 'b' }), deps))).toBe('resource-exhausted');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not consult the allow-list or spend quota for unauthenticated or invalid requests', async () => {
    const deps = depsFor({ allowed: true });
    await codeOf(askGeminiHandler(req({ prompt: 'a' }, false), deps));
    await codeOf(askGeminiHandler(req({ prompt: '' }), deps));
    expect(deps.access.checks).toBe(0);
    expect(deps.usage.calls).toBe(0);
  });
});
