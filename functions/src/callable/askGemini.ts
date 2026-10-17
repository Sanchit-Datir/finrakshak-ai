import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { geminiApiKey } from '../config/secrets.js';
import { GEMINI_LIMITS, GeminiError, generateText } from '../services/gemini.js';

const InputSchema = z.object({
  prompt: z.string().trim().min(1).max(GEMINI_LIMITS.maxPromptChars),
});

/** Exported separately so it can be unit-tested without the Functions runtime. */
export async function askGeminiHandler(
  request: CallableRequest<unknown>,
): Promise<{ text: string }> {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const input = InputSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError('invalid-argument', 'A prompt of 1 to 8000 characters is required');
  }
  try {
    // Output is untrusted text: callers that need structure must validate it (B-13).
    return { text: await generateText(input.data.prompt) };
  } catch (error) {
    // Never log the prompt (B-16); the error type is enough to debug.
    if (error instanceof GeminiError) {
      throw new HttpsError('unavailable', 'The AI service could not answer. Try again.');
    }
    throw error;
  }
}

export const askGemini = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    secrets: [geminiApiKey],
    // Cost guard until per-user quotas exist (B-15): at most 5 copies run at once.
    maxInstances: 5,
    timeoutSeconds: 60,
  },
  askGeminiHandler,
);
