import { GoogleGenAI } from '@google/genai';
import { getEnv } from '../config/env.js';

/** Hard limits — see docs/BOUNDARY_CONDITIONS.md (B-10..B-14). */
export const GEMINI_LIMITS = {
  maxPromptChars: 8_000,
  timeoutMs: 30_000,
  maxOutputTokens: 1_024,
} as const;

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  const env = getEnv();
  // Vertex AI mode uses Application Default Credentials: no API keys in code.
  client ??= new GoogleGenAI({
    vertexai: true,
    project: env.GCLOUD_PROJECT,
    location: env.VERTEX_LOCATION,
  });
  return client;
}

export class GeminiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GeminiError';
  }
}

/**
 * Calls Gemini with a bounded prompt and a timeout. Output is UNTRUSTED text:
 * callers must validate/parse it (e.g. with zod) before using it.
 */
export async function generateText(prompt: string): Promise<string> {
  if (prompt.trim().length === 0) throw new GeminiError('Empty prompt');
  if (prompt.length > GEMINI_LIMITS.maxPromptChars) throw new GeminiError('Prompt too long');

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, GEMINI_LIMITS.timeoutMs);
  try {
    const res = await getClient().models.generateContent({
      model: getEnv().GEMINI_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: GEMINI_LIMITS.maxOutputTokens,
        abortSignal: controller.signal,
      },
    });
    const text = res.text;
    if (text === undefined || text.length === 0) {
      throw new GeminiError('Empty or blocked model response');
    }
    return text;
  } catch (cause) {
    if (cause instanceof GeminiError) throw cause;
    throw new GeminiError('Gemini request failed', { cause });
  } finally {
    clearTimeout(timer);
  }
}
