import type { GetRiskScoresInput } from '@fund-tracker/shared';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { RATE_LIMITS, RATE_WINDOW_MS } from '../config/limits.js';
import { describeError } from '../services/log.js';
import { defaultProfileStore, type ProfileStore } from '../services/profiles.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';
import {
  RISK_SCORES_SCOPE,
  firestoreRiskReader,
  readRiskScores,
  type RiskScoreReader,
  type RiskScoresResult,
} from '../services/riskScores.js';

/**
 * Synthetic risk scores for the app (REMAINING_WORK.md, W3b). Thin: auth, input, a usable profile, then
 * the service. For now every person with a profile sees every branch (owner's decision, 17 Oct 2026). SYNTH data only (B-54); a score is a lead, never a
 * verdict (B-58).
 */

/** Narrow local copy of GetRiskScoresInputSchema (functions deploy without workspace packages). */
const InputSchema = z
  .object({
    loanId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,120}$/)
      .optional(),
  })
  .strict();

type AssertTrue<T extends true> = T;
export type InputInSync = AssertTrue<
  z.infer<typeof InputSchema> extends GetRiskScoresInput ? true : false
>;

const limiter = createRateLimiter({
  limit: RATE_LIMITS.getRiskScoresPerMinute,
  windowMs: RATE_WINDOW_MS,
});

export interface GetRiskScoresDeps {
  readonly profiles: ProfileStore;
  readonly reader: RiskScoreReader;
  readonly limiter: RateLimiter;
}

const defaultDeps = (): GetRiskScoresDeps => ({
  profiles: defaultProfileStore(),
  reader: firestoreRiskReader,
  limiter,
});

export async function getRiskScoresHandler(
  request: CallableRequest<unknown>,
  deps: GetRiskScoresDeps = defaultDeps(),
): Promise<Omit<RiskScoresResult, 'skipped'>> {
  if (request.auth === undefined) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const rate = deps.limiter.check(uid);
  if (!rate.allowed)
    throw new HttpsError(
      'resource-exhausted',
      `Too many requests. Wait ${String(rate.retryAfterSeconds)} seconds and try again.`,
      { reason: 'rate_limit', retryAfterSeconds: rate.retryAfterSeconds },
    );
  const input = InputSchema.safeParse(request.data ?? {});
  if (!input.success) throw new HttpsError('invalid-argument', 'A valid loan id is required');
  const email = typeof request.auth.token.email === 'string' ? request.auth.token.email : null;
  const profile = await deps.profiles.get(uid, email);
  if (profile === null) throw new HttpsError('permission-denied', 'Your account is not set up');
  // Sign-in and a usable profile are required; for now that profile sees every branch.
  const scope = RISK_SCORES_SCOPE;
  try {
    const result = await readRiskScores(deps.reader, { scope, loanId: input.data.loanId ?? null });
    logger.info('getRiskScores', {
      uid,
      scope: scope.kind,
      scores: result.scores.length,
      alerts: result.alerts.length,
      explanations: result.explanations.length,
      skipped: result.skipped,
    });
    return {
      scores: result.scores,
      alerts: result.alerts,
      explanations: result.explanations,
      truncated: result.truncated,
    };
  } catch (error) {
    logger.error('getRiskScores: read failed', { uid, ...describeError(error) });
    throw new HttpsError('internal', 'The risk scores could not be loaded.', {
      reason: 'risk_scores_read_failed',
    });
  }
}

export const getRiskScores = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    maxInstances: 2,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  (request) => getRiskScoresHandler(request),
);
