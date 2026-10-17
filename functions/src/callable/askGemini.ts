import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { RATE_LIMITS, RATE_WINDOW_MS } from '../config/limits.js';
import { geminiApiKey } from '../config/secrets.js';
import { GEMINI_LIMITS, GeminiError, generateText } from '../services/gemini.js';
import { describeError } from '../services/log.js';
import { defaultProfileStore } from '../services/profiles.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';
import { accessFromProfiles, type AccessStore } from '../services/access.js';
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

export interface AskGeminiDeps {
  usage: UsageStore;
  access: AccessStore;
  limiter: RateLimiter;
}

/** Shared by every request this instance serves. */
const askGeminiLimiter = createRateLimiter({
  limit: RATE_LIMITS.askGeminiPerMinute,
  windowMs: RATE_WINDOW_MS,
});

/** Exported separately so it can be unit-tested without the Functions runtime. */
export async function askGeminiHandler(
  request: CallableRequest<unknown>,
  deps: AskGeminiDeps = {
    usage: firestoreUsageStore(),
    access: accessFromProfiles(defaultProfileStore()),
    limiter: askGeminiLimiter,
  },
): Promise<AskGeminiResult> {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  // Cheapest check first, before any validation or database work: a loop or a stolen session cannot
  // turn into a flood of Firestore or Gemini calls. Applies to the free mock too.
  const rate = deps.limiter.check(request.auth.uid);
  if (!rate.allowed) {
    logger.warn('askGemini: rate limited', { uid: request.auth.uid });
    throw new HttpsError(
      'resource-exhausted',
      `Too many requests. Wait ${String(rate.retryAfterSeconds)} seconds and try again.`,
      { reason: 'rate_limit', retryAfterSeconds: rate.retryAfterSeconds },
    );
  }
  const input = InputSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError('invalid-argument', 'A prompt of 1 to 8000 characters is required');
  }

  // Only billed providers are gated: the mock is free and needs no Firestore. Order matters: the
  // allow-list runs first so unlisted accounts never create usage records or reach the model.
  const env = getEnv();
  const mock = env.GEMINI_PROVIDER === 'mock';
  let remainingToday: number | null = null;
  if (!mock) {
    try {
      if (!(await deps.access.isAllowed(request.auth.uid))) {
        logger.warn('askGemini: refused, AI not enabled for this account', {
          uid: request.auth.uid,
        });
        throw new HttpsError(
          'permission-denied',
          'This account is not enabled for AI features. Ask an administrator.',
        );
      }
      const quota = await consumeDailyQuota(deps.usage, request.auth.uid, env.GEMINI_DAILY_LIMIT);
      if (!quota.allowed) {
        logger.warn('askGemini: refused, daily limit reached', { uid: request.auth.uid });
        throw new HttpsError('resource-exhausted', 'Daily AI limit reached. Try again tomorrow.', {
          reason: 'daily_limit',
        });
      }
      remainingToday = quota.remaining;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      // The access or usage lookup itself failed (for example a Firestore permission): fail closed, and say so.
      logger.error('askGemini: access or usage lookup failed', {
        uid: request.auth.uid,
        ...describeError(error),
      });
      throw new HttpsError('internal', 'Could not check your access. Try again.', {
        reason: 'access_lookup_failed',
      });
    }
  }

  try {
    // Output is untrusted text: callers that need structure must validate it (B-13).
    const text = await generateText(input.data.prompt);
    // Sizes only: never the question or the answer.
    logger.info('askGemini', {
      uid: request.auth.uid,
      outcome: 'ok',
      mock,
      promptChars: input.data.prompt.length,
      replyChars: text.length,
      remainingToday,
    });
    return { text, mock, remainingToday };
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
