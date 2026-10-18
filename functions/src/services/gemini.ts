import { FinishReason, GoogleGenAI } from '@google/genai';
import { getEnv } from '../config/env.js';
import { mockGenerateText } from './gemini-mock.js';

/** Hard limits — see docs/BOUNDARY_CONDITIONS.md (B-10..B-14). */
export const GEMINI_LIMITS = {
  maxPromptChars: 8_000,
  timeoutMs: 30_000,
  maxOutputTokens: 1_024,
} as const;

let client: GoogleGenAI | undefined;

/** The shared client for the configured billed provider (never created on the mock). */
export function getClient(): GoogleGenAI {
  const env = getEnv();
  if (env.GEMINI_PROVIDER === 'vertex') {
    // Vertex AI mode uses Application Default Credentials: no API keys in code.
    client ??= new GoogleGenAI({
      vertexai: true,
      project: env.GCLOUD_PROJECT,
      location: env.VERTEX_LOCATION,
    });
  } else {
    // The key comes from Secret Manager via the function's `secrets` option, never from code.
    if (env.GEMINI_API_KEY === undefined) throw new GeminiError('Gemini API key is not configured');
    client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return client;
}

export class GeminiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GeminiError';
  }
}

/** Larger prompts are allowed only for structured tasks that ask for one (B-10); never above this. */
export const GEMINI_MAX_JSON_PROMPT_CHARS = 30_000;

function checkPrompt(prompt: string, maxChars: number): void {
  if (prompt.trim().length === 0) throw new GeminiError('Empty prompt');
  if (prompt.length > maxChars) throw new GeminiError('Prompt too long');
}

async function callModel(prompt: string, json: boolean): Promise<string> {
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
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    });
    // B-11: a reply cut off at the token limit is not a complete answer.
    if (res.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
      throw new GeminiError('Model response was cut off');
    }
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

/**
 * Calls Gemini with a bounded prompt and a timeout. Output is UNTRUSTED text:
 * callers must validate/parse it (e.g. with zod) before using it.
 */
export async function generateText(prompt: string): Promise<string> {
  checkPrompt(prompt, GEMINI_LIMITS.maxPromptChars);
  // Cost guard: the mock provider never creates a client or touches the network.
  if (getEnv().GEMINI_PROVIDER === 'mock') return mockGenerateText();
  return callModel(prompt, false);
}

/**
 * Asks for a JSON reply. The text is still UNTRUSTED: parse it with zod. Never called on the mock
 * provider (callers build their own mock result), so this throws there instead of spending nothing.
 */
export async function generateJson(prompt: string, maxPromptChars: number): Promise<string> {
  const limit = Math.min(maxPromptChars, GEMINI_MAX_JSON_PROMPT_CHARS);
  checkPrompt(prompt, limit);
  if (getEnv().GEMINI_PROVIDER === 'mock')
    throw new GeminiError('The mock provider has no JSON mode');
  return callModel(prompt, true);
}

/** Test helper: drop the cached client so a test can supply its own. */
export function resetGeminiClient(): void {
  client = undefined;
}
