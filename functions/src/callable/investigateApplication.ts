import type { InvestigateApplicationResult } from '@finrakshak-ai/shared';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getEnv } from '../config/env.js';
import { RATE_LIMITS, RATE_WINDOW_MS } from '../config/limits.js';
import { geminiApiKey } from '../config/secrets.js';
import { accessFromProfiles } from '../services/access.js';
import { gateBilledCall, modelFailure, type BilledGateDeps } from '../services/billed-gate.js';
import { GeminiError } from '../services/gemini.js';
import { geminiToolModel } from '../services/gemini-tools.js';
import { InputSchema } from '../services/investigation/input.js';
import {
  checkSize,
  InvestigationInputTooLarge,
  investigate,
  mockModel,
} from '../services/investigation/investigate.js';
import { defaultProfileStore } from '../services/profiles.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';
import type { ToolModel } from '../services/tool-model.js';
import { describeError } from '../services/log.js';
import { consumeDailyQuota, firestoreUsageStore } from '../services/usage-limit.js';

export interface InvestigateApplicationDeps extends BilledGateDeps {
  readonly limiter: RateLimiter;
  readonly now: () => Date;
  /** The billed model; tests pass a scripted one. Never used on the mock provider. */
  readonly model?: () => ToolModel;
}

const limiter = createRateLimiter({
  limit: RATE_LIMITS.investigateApplicationPerMinute,
  windowMs: RATE_WINDOW_MS,
});

function sizeChecked(data: unknown): ReturnType<typeof InputSchema.parse> {
  const input = InputSchema.safeParse(data);
  if (!input.success)
    throw new HttpsError('invalid-argument', 'The application data could not be read.');
  try {
    checkSize(input.data);
  } catch (error) {
    if (error instanceof InvestigationInputTooLarge)
      throw new HttpsError('invalid-argument', 'Too much data for one investigation.', {
        reason: 'too_large',
      });
    throw error;
  }
  return input.data;
}

/**
 * Counts one more model call against today's limit (owner, 18 Oct 2026: every call counts and the
 * limit is never crossed). Returns the calls left, or null when none is left or the lookup failed
 * (fail closed: the run stops and keeps what was already verified).
 */
async function countNextCall(
  deps: BilledGateDeps,
  uid: string,
  limit: number,
  now: Date,
): Promise<number | null> {
  try {
    const quota = await consumeDailyQuota(deps.usage, uid, limit, now);
    if (!quota.allowed) logger.warn('investigateApplication: stopped at the daily limit', { uid });
    return quota.allowed ? quota.remaining : null;
  } catch (error) {
    logger.error('investigateApplication: usage lookup failed mid-run', {
      uid,
      ...describeError(error),
    });
    return null;
  }
}

/**
 * The bundle comes from the caller's own workspace (applications are not stored on the server), so
 * there is no stored resource to authorise beyond the signed-in, AI-enabled account (as
 * analyseApplication). Gates in order: sign-in, rate limit, input, size, allow-list + daily limit.
 */
export async function investigateApplicationHandler(
  request: CallableRequest<unknown>,
  deps: InvestigateApplicationDeps = {
    usage: firestoreUsageStore(),
    access: accessFromProfiles(defaultProfileStore()),
    limiter,
    now: () => new Date(),
  },
): Promise<InvestigateApplicationResult> {
  if (request.auth === undefined) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const rate = deps.limiter.check(uid);
  if (!rate.allowed)
    throw new HttpsError(
      'resource-exhausted',
      `Too many requests. Wait ${String(rate.retryAfterSeconds)} seconds and try again.`,
      { reason: 'rate_limit', retryAfterSeconds: rate.retryAfterSeconds },
    );
  // Size first, so an oversized request never counts against the daily limit (B-10, B-15).
  const input = sizeChecked(request.data);
  const env = getEnv();
  const mock = env.GEMINI_PROVIDER === 'mock';
  // The first model call is counted here (allow-list + daily limit); every further one in the loop.
  let remainingToday = mock
    ? null
    : await gateBilledCall(deps, uid, env.GEMINI_DAILY_LIMIT, 'investigateApplication');
  const nextCall = async (): Promise<boolean> => {
    const used = await countNextCall(deps, uid, env.GEMINI_DAILY_LIMIT, deps.now());
    if (used !== null) remainingToday = used;
    return used !== null;
  };
  try {
    const model = mock ? mockModel(input) : (deps.model ?? geminiToolModel)();
    const { summaryWithheld, ...result } = await investigate(
      input,
      model,
      mock ? {} : { beforeNextTurn: nextCall },
    );
    // Counts only: never field values, names, claims or the model's text (B-16).
    logger.info('investigateApplication', {
      uid,
      mock,
      parties: input.parties.length,
      ratios: input.ratios.length,
      toolCalls: result.toolCalls,
      modelCalls: result.modelCalls,
      stoppedAtDailyLimit: result.stoppedAtDailyLimit,
      claims: result.claims,
      summaryWithheld,
      remainingToday,
    });
    return {
      ...result,
      mock,
      model: mock ? null : model.id,
      investigatedAt: deps.now().toISOString(),
      remainingToday,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw modelFailure('investigateApplication', error);
    throw error;
  }
}

export const investigateApplication = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    secrets: [geminiApiKey],
    // Cost guards: at most 5 copies, the per-person rate limit and the daily AI limit (B-15).
    maxInstances: 5,
    minInstances: 0,
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  (request) => investigateApplicationHandler(request),
);
