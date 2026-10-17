import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import type { AccessStore } from '../services/access.js';
import type * as GeminiModule from '../services/gemini.js';
import { GeminiError } from '../services/gemini.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';
import type { UsageStore } from '../services/usage-limit.js';
import { askGeminiHandler, type AskGeminiDeps } from './askGemini.js';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions', () => ({ logger: log }));

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

/** Effectively unlimited, so tests about other behaviour never trip the burst limit. */
const roomyLimiter = (): RateLimiter => createRateLimiter({ limit: 1_000, windowMs: 60_000 });

/** Never touched by mock-provider tests; fails loudly if the handler uses either store. */
const untouchedDeps: AskGeminiDeps = {
  usage: { tryIncrement: () => Promise.reject(new Error('usage store must not be used')) },
  access: { isAllowed: () => Promise.reject(new Error('access store must not be used')) },
  limiter: roomyLimiter(),
};

interface CountingDeps extends AskGeminiDeps {
  usage: UsageStore & { calls: number };
  access: AccessStore & { checks: number };
}

function depsFor(options: {
  allowed: boolean;
  allowedCalls?: number;
  limiter?: RateLimiter;
}): CountingDeps {
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
  return { usage, access, limiter: options.limiter ?? roomyLimiter() };
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

async function detailsOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpsError) return error.details;
    throw error;
  }
  return undefined;
}

beforeEach(() => {
  resetEnvCache();
  generateText.mockReset();
  log.info.mockClear();
  log.warn.mockClear();
  log.error.mockClear();
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

describe('askGeminiHandler burst limit (per person, before any other work)', () => {
  it('refuses a rapid loop even with the free mock, and says how long to wait', async () => {
    const deps = { ...untouchedDeps, limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) };
    generateText.mockResolvedValue('ok');
    await askGeminiHandler(req({ prompt: 'a' }), deps);
    await askGeminiHandler(req({ prompt: 'b' }), deps);
    const attempt = askGeminiHandler(req({ prompt: 'c' }), deps);
    expect(await codeOf(attempt)).toBe('resource-exhausted');
    const details = (await detailsOf(askGeminiHandler(req({ prompt: 'd' }), deps))) as {
      reason: string;
      retryAfterSeconds: number;
    };
    expect(details.reason).toBe('rate_limit');
    expect(details.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('never reaches the stores or the model once limited (billed provider)', async () => {
    vi.stubEnv('GEMINI_PROVIDER', 'apikey');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    generateText.mockResolvedValue('real reply');
    const deps = depsFor({
      allowed: true,
      limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    });
    await askGeminiHandler(req({ prompt: 'a' }), deps);
    generateText.mockClear();
    const checksBefore = deps.access.checks;
    expect(await codeOf(askGeminiHandler(req({ prompt: 'b' }), deps))).toBe('resource-exhausted');
    expect(deps.access.checks).toBe(checksBefore);
    expect(deps.usage.calls).toBe(1);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not let a stranger use up a signed-in person's allowance", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const deps = { ...untouchedDeps, limiter };
    generateText.mockResolvedValue('ok');
    for (let i = 0; i < 5; i += 1)
      await codeOf(askGeminiHandler(req({ prompt: 'x' }, false), deps));
    expect(await codeOf(askGeminiHandler(req({ prompt: 'a' }), deps))).toBe('ok');
  });

  it('tells the daily limit apart from the burst limit', async () => {
    vi.stubEnv('GEMINI_PROVIDER', 'apikey');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    generateText.mockResolvedValue('real reply');
    const deps = depsFor({ allowed: true, allowedCalls: 1 });
    await askGeminiHandler(req({ prompt: 'a' }), deps);
    expect(await detailsOf(askGeminiHandler(req({ prompt: 'b' }), deps))).toEqual({
      reason: 'daily_limit',
    });
  });
});

describe('askGeminiHandler logging and lookup failures', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_PROVIDER', 'apikey');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    generateText.mockResolvedValue('the secret answer');
  });

  it('logs sizes and outcome only: never the question or the answer', async () => {
    await askGeminiHandler(req({ prompt: 'my private question' }), depsFor({ allowed: true }));
    expect(log.info).toHaveBeenCalledWith(
      'askGemini',
      expect.objectContaining({
        uid: 'u1',
        outcome: 'ok',
        mock: false,
        promptChars: 19,
        replyChars: 17,
      }),
    );
    const everything = JSON.stringify([
      log.info.mock.calls,
      log.warn.mock.calls,
      log.error.mock.calls,
    ]);
    expect(everything).not.toContain('my private question');
    expect(everything).not.toContain('the secret answer');
  });

  it('logs why a person was refused', async () => {
    await codeOf(askGeminiHandler(req({ prompt: 'a' }), depsFor({ allowed: false })));
    expect(log.warn).toHaveBeenCalledWith('askGemini: refused, AI not enabled for this account', {
      uid: 'u1',
    });
    await codeOf(
      askGeminiHandler(req({ prompt: 'a' }), depsFor({ allowed: true, allowedCalls: 0 })),
    );
    expect(log.warn).toHaveBeenCalledWith('askGemini: refused, daily limit reached', { uid: 'u1' });
  });

  it.each([
    [
      'the access check',
      {
        ...depsFor({ allowed: true }),
        access: { isAllowed: () => Promise.reject(new Error('boom')) },
      },
    ],
    [
      'the daily-limit counter',
      {
        ...depsFor({ allowed: true }),
        usage: { tryIncrement: () => Promise.reject(new Error('boom')) },
      },
    ],
  ])(
    'fails closed with a clear error when %s itself breaks, and never calls the model',
    async (_label, deps) => {
      const attempt = askGeminiHandler(req({ prompt: 'a' }), deps);
      expect(await codeOf(attempt)).toBe('internal');
      expect(await detailsOf(askGeminiHandler(req({ prompt: 'a' }), deps))).toEqual({
        reason: 'access_lookup_failed',
      });
      expect(generateText).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith(
        'askGemini: access or usage lookup failed',
        expect.objectContaining({ uid: 'u1', errorMessage: 'boom' }),
      );
    },
  );
});
