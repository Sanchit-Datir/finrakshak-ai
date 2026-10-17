import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { geminiApiKey } from '../config/secrets.js';
import { GEMINI_LIMITS, GeminiError, generateText } from '../services/gemini.js';
import {
  consumeDailyQuota,
  firestoreUsageStore,
  type UsageStore,
} from '../services/usage-limit.js';

const InputSchema = z.object({
  prompt: z.string().trim().min(1).max(GEMINI_LIMITS.maxPromptChars),
});

export interface AskGeminiResult {
  text: string;
  /** True when the reply came from the free mock provider, not a billed model. */
  mock: boolean;
  /** Billed calls left today for this user; null when the mock answered (no limit applies). */
  remainingToday: number | null;
}

/** Exported separately so it can be unit-tested without the Functions runtime. */
export async function askGeminiHandler(
  request: CallableRequest<unknown>,
  usage: UsageStore = firestoreUsageStore(),
): Promise<AskGeminiResult> {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const input = InputSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError('invalid-argument', 'A prompt of 1 to 8000 characters is required');
  }

  // Only billed providers count against the daily limit; the mock is free and needs no Firestore.
  const env = getEnv();
  const mock = env.GEMINI_PROVIDER === 'mock';
  let remainingToday: number | null = null;
  if (!mock) {
    const quota = await consumeDailyQuota(usage, request.auth.uid, env.GEMINI_DAILY_LIMIT);
    if (!quota.allowed) {
      throw new HttpsError('resource-exhausted', 'Daily AI limit reached. Try again tomorrow.');
    }
    remainingToday = quota.remaining;
  }

  try {
    // Output is untrusted text: callers that need structure must validate it (B-13).
    return { text: await generateText(input.data.prompt), mock, remainingToday };
  } catch (error) {
    // Never log the prompt (B-16); the upstream status and message are enough to debug.
    if (error instanceof GeminiError) {
      const cause = error.cause as { name?: string; status?: number; message?: string } | undefined;
      logger.error('askGemini: model call failed', {
        reason: error.message,
        causeName: cause?.name,
        causeStatus: cause?.status,
        causeMessage: cause?.message?.slice(0, 300),
      });
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
    // Cost guards: at most 5 copies at once, plus the per-user daily limit in the handler (B-15).
    maxInstances: 5,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  (request) => askGeminiHandler(request),
);
