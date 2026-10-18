import type { AnalyseApplicationInput, AnalyseApplicationResult } from '@fund-tracker/shared';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { RATE_LIMITS, RATE_WINDOW_MS } from '../config/limits.js';
import { geminiApiKey } from '../config/secrets.js';
import { accessFromProfiles } from '../services/access.js';
import {
  AnalysisInputTooLarge,
  analyseWithModel,
  buildPrompt,
  mockAnalysis,
} from '../services/applicationAnalysis.js';
import { gateBilledCall, modelFailure, type BilledGateDeps } from '../services/billed-gate.js';
import { GeminiError } from '../services/gemini.js';
import { defaultProfileStore } from '../services/profiles.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';
import { firestoreUsageStore } from '../services/usage-limit.js';

/**
 * Runtime copy of AnalyseApplicationInputSchema (packages/shared/src/applicationAnalysis.ts): Cloud
 * Build cannot install the workspace package, so only its types are imported. `InputInSync` fails to
 * compile if the two drift apart.
 */
const ref = z.string().min(1).max(80);
const text = (max: number): z.ZodString => z.string().trim().max(max);
const InputSchema = z.object({
  borrowerType: z.enum([
    'individual',
    'farmer',
    'proprietorship',
    'partnership',
    'private_limited',
    'other',
  ]),
  documents: z
    .array(
      z.object({
        docId: ref,
        docType: text(80).min(1),
        fields: z
          .array(
            z.object({
              fieldId: ref,
              label: text(120).min(1),
              value: text(200),
              reviewed: z.boolean(),
            }),
          )
          .max(30),
      }),
    )
    .max(12),
  findings: z
    .array(
      z.object({
        findingId: ref,
        title: text(300).min(1),
        priority: z.enum(['routine', 'needs_attention', 'urgent']),
        observed: text(300),
      }),
    )
    .max(25),
  attention: z
    .object({
      score: z.number().int().min(0).max(100),
      band: z.enum(['routine', 'needs_attention', 'urgent']),
      driverIds: z.array(ref).max(3),
    })
    .nullable(),
});
type AssertTrue<T extends true> = T;
type Input = z.infer<typeof InputSchema>;
export type InputInSync = AssertTrue<
  Input extends AnalyseApplicationInput
    ? AnalyseApplicationInput extends Input
      ? true
      : false
    : false
>;

export interface AnalyseApplicationDeps extends BilledGateDeps {
  readonly limiter: RateLimiter;
  readonly now: () => Date;
}

const limiter = createRateLimiter({
  limit: RATE_LIMITS.analyseApplicationPerMinute,
  windowMs: RATE_WINDOW_MS,
});

/**
 * The application data comes from the caller's own workspace (applications are not stored on the
 * server), so there is no stored resource to authorise beyond the signed-in, AI-enabled account.
 */
export async function analyseApplicationHandler(
  request: CallableRequest<unknown>,
  deps: AnalyseApplicationDeps = {
    usage: firestoreUsageStore(),
    access: accessFromProfiles(defaultProfileStore()),
    limiter,
    now: () => new Date(),
  },
): Promise<AnalyseApplicationResult> {
  if (request.auth === undefined) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const rate = deps.limiter.check(uid);
  if (!rate.allowed)
    throw new HttpsError(
      'resource-exhausted',
      `Too many requests. Wait ${String(rate.retryAfterSeconds)} seconds and try again.`,
      { reason: 'rate_limit', retryAfterSeconds: rate.retryAfterSeconds },
    );
  const input = InputSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError('invalid-argument', 'The application data could not be read.');
  // Size first, so an oversized request never counts against the daily limit (B-10, B-15).
  try {
    buildPrompt(input.data);
  } catch (error) {
    if (error instanceof AnalysisInputTooLarge)
      throw new HttpsError(
        'invalid-argument',
        'Too much data for one analysis. Remove some documents and try again.',
        { reason: 'too_large' },
      );
    throw error;
  }
  const env = getEnv();
  const mock = env.GEMINI_PROVIDER === 'mock';
  const remainingToday = mock
    ? null
    : await gateBilledCall(deps, uid, env.GEMINI_DAILY_LIMIT, 'analyseApplication');
  try {
    const result = mock ? mockAnalysis(input.data) : await analyseWithModel(input.data);
    // Counts only: never field values, findings or the model's text (B-16).
    logger.info('analyseApplication', {
      uid,
      mock,
      documents: input.data.documents.length,
      findings: input.data.findings.length,
      facts: result.facts.length,
      dropped: result.dropped,
      remainingToday,
    });
    return {
      ...result,
      mock,
      model: mock ? null : env.GEMINI_MODEL,
      analysedAt: deps.now().toISOString(),
      remainingToday,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw modelFailure('analyseApplication', error);
    throw error;
  }
}

export const analyseApplication = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    secrets: [geminiApiKey],
    // Cost guards: at most 5 copies, the per-person rate limit and the daily AI limit (B-15).
    maxInstances: 5,
    minInstances: 0,
    memory: '256MiB',
    timeoutSeconds: 90,
  },
  (request) => analyseApplicationHandler(request),
);
