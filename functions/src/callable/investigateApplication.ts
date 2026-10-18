import type { InvestigateApplicationResult } from '@fund-tracker/shared';
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
import { firestoreUsageStore } from '../services/usage-limit.js';

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
  const remainingToday = mock
    ? null
    : await gateBilledCall(deps, uid, env.GEMINI_DAILY_LIMIT, 'investigateApplication');
  try {
    const model = mock ? mockModel(input) : (deps.model ?? geminiToolModel)();
    const { summaryWithheld, ...result } = await investigate(input, model);
    // Counts only: never field values, names, claims or the model's text (B-16).
    logger.info('investigateApplication', {
      uid,
      mock,
      parties: input.parties.length,
      ratios: input.ratios.length,
      toolCalls: result.toolCalls,
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
