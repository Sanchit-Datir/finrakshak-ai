import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import { generateText, GeminiError } from './gemini.js';
import { MOCK_GEMINI_REPLY } from './gemini-mock.js';

const clientConstructor = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({ GoogleGenAI: clientConstructor }));

beforeEach(() => {
  resetEnvCache();
  clientConstructor.mockClear();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('generateText input bounds', () => {
  it('rejects empty prompt', async () => {
    await expect(generateText('   ')).rejects.toBeInstanceOf(GeminiError);
  });
  it('rejects oversized prompt', async () => {
    await expect(generateText('a'.repeat(8_001))).rejects.toBeInstanceOf(GeminiError);
  });
});

describe('cost guard: tests never reach a billed model', () => {
  it('answers from the mock and never creates a Gemini client', async () => {
    await expect(generateText('anything')).resolves.toBe(MOCK_GEMINI_REPLY);
    expect(clientConstructor).not.toHaveBeenCalled();
  });

  it('stays on the mock even when an API key is present', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    await expect(generateText('anything')).resolves.toBe(MOCK_GEMINI_REPLY);
    expect(clientConstructor).not.toHaveBeenCalled();
  });

  it('uses the real client only when the provider is set explicitly', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'real reply' });
    clientConstructor.mockImplementation(() => ({ models: { generateContent } }));
    vi.stubEnv('GEMINI_PROVIDER', 'apikey');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');

    await expect(generateText('hello')).resolves.toBe('real reply');
    expect(clientConstructor).toHaveBeenCalledTimes(1);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.1-flash-lite' }),
    );
  });
});
