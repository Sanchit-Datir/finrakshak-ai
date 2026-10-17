import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GeminiModule from '../services/gemini.js';
import { GeminiError } from '../services/gemini.js';
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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpsError) return error.code;
    throw error;
  }
  return 'ok';
}

describe('askGeminiHandler', () => {
  beforeEach(() => {
    generateText.mockReset();
  });

  it('rejects unauthenticated callers before doing anything', async () => {
    expect(await codeOf(askGeminiHandler(req({ prompt: 'hi' }, false)))).toBe('unauthenticated');
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([{}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }, { prompt: 'a'.repeat(8_001) }])(
    'rejects invalid input %j',
    async (data) => {
      expect(await codeOf(askGeminiHandler(req(data)))).toBe('invalid-argument');
      expect(generateText).not.toHaveBeenCalled();
    },
  );

  it('returns the model text for a valid prompt', async () => {
    generateText.mockResolvedValue('hello');
    await expect(askGeminiHandler(req({ prompt: '  say hello ' }))).resolves.toEqual({
      text: 'hello',
    });
    expect(generateText).toHaveBeenCalledWith('say hello');
  });

  it('maps Gemini failures to a retryable error without leaking details', async () => {
    generateText.mockRejectedValue(new GeminiError('secret internal detail'));
    const error = await askGeminiHandler(req({ prompt: 'hi' })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('unavailable');
    expect((error as HttpsError).message).not.toContain('secret internal detail');
  });
});
