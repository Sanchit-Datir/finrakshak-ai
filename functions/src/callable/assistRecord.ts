import type { AssistInput, AssistResult } from '@finrakshak-ai/shared';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { RATE_LIMITS, RATE_WINDOW_MS } from '../config/limits.js';
import { geminiApiKey } from '../config/secrets.js';
import { accessFromProfiles } from '../services/access.js';
import {
  AssistInputTooLarge,
  assistWithModel,
  buildPrompt,
  mockAssist,
} from '../services/assist.js';
import { gateBilledCall, modelFailure, type BilledGateDeps } from '../services/billed-gate.js';
import { GeminiError } from '../services/gemini.js';
import { defaultProfileStore } from '../services/profiles.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';
import { firestoreUsageStore } from '../services/usage-limit.js';

/**
 * Runtime copy of AssistInputSchema (packages/shared/src/assist.ts): Cloud Build cannot install the
 * workspace package, so only its types are imported. `InputInSync` fails to compile on drift.
 */
const text = (max: number): z.ZodString => z.string().trim().max(max);
const ref = z.string().regex(/^[A-Z]{1,2}\d{1,3}$/);
export const InputSchema = z.object({
  task: z.enum(['explain', 'next_steps', 'draft_request', 'memo', 'money_trail', 'ask']),
  subject: z.object({
    kind: z.enum(['portfolio', 'application', 'borrower', 'loan', 'alert', 'case']),
    title: text(160).min(1),
  }),
  question: text(400),
  facts: z
    .array(
      z.object({
        ref,
        kind: z.enum([
          'subject',
          'finding',
          'alert',
          'transaction',
          'document',
          'record',
          'evidence',
          'step',
          'metric',
        ]),
        label: text(120).min(1),
        text: text(400),
      }),
    )
    .min(1)
    .max(60),
});
type AssertTrue<T extends true> = T;
type Input = z.infer<typeof InputSchema>;
export type InputInSync = AssertTrue<
  Input extends AssistInput ? (AssistInput extends Input ? true : false) : false
>;

export interface AssistRecordDeps extends BilledGateDeps {
  readonly limiter: RateLimiter;
  readonly now: () => Date;
}

const limiter = createRateLimiter({
  limit: RATE_LIMITS.assistRecordPerMinute,
  windowMs: RATE_WINDOW_MS,
});

/**
 * The record comes from the caller's own workspace (records are not stored on the server), so there
 * is no stored resource to authorise beyond the signed-in, AI-enabled account (same as
 * analyseApplication). An `ask` question must not be empty.
 */
export async function assistRecordHandler(
  request: CallableRequest<unknown>,
  deps: AssistRecordDeps = {
    usage: firestoreUsageStore(),
    access: accessFromProfiles(defaultProfileStore()),
    limiter,
    now: () => new Date(),
  },
): Promise<AssistResult> {
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
  if (!input.success || (input.data.task === 'ask' && input.data.question === ''))
    throw new HttpsError('invalid-argument', 'The request could not be read.');
  // Size first, so an oversized request never counts against the daily limit (B-10, B-15).
  try {
    buildPrompt(input.data);
  } catch (error) {
    if (error instanceof AssistInputTooLarge)
      throw new HttpsError('invalid-argument', 'This record is too large to send in one request.', {
        reason: 'too_large',
      });
    throw error;
  }
  const env = getEnv();
  const mock = env.GEMINI_PROVIDER === 'mock';
  const remainingToday = mock
    ? null
    : await gateBilledCall(deps, uid, env.GEMINI_DAILY_LIMIT, 'assistRecord');
  try {
    const result = mock ? mockAssist(input.data) : await assistWithModel(input.data);
    // Counts only: never the facts, the question or the model's text (B-16).
    logger.info('assistRecord', {
      uid,
      mock,
      task: input.data.task,
      subject: input.data.subject.kind,
      facts: input.data.facts.length,
      ...result.check,
      remainingToday,
    });
    return {
      ...result,
      mock,
      model: mock ? null : env.GEMINI_MODEL,
      generatedAt: deps.now().toISOString(),
      remainingToday,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw modelFailure('assistRecord', error);
    throw error;
  }
}

export const assistRecord = onCall(
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
  (request) => assistRecordHandler(request),
);
