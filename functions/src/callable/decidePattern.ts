import type { PatternDecision, PatternDecisionResult } from '@finrakshak-ai/shared';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { firestoreDecider, type PatternDecider } from '../services/patterns.js';

/**
 * An administrator's decision on a mined pattern (PATTERN_MINER_PLAN.md; B-61). Thin: auth, role,
 * input, then the service. Only a signed-in person with the `admin` claim can approve, so the miner
 * can never approve its own proposal: its service account has no way to call this as a person.
 */

/** Narrow local copy of PatternDecisionSchema (functions deploy without workspace packages). */
const proposalId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const InputSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), proposalId }).strict(),
  z.object({ decision: z.literal('reject'), proposalId }).strict(),
  z
    .object({ decision: z.literal('retire'), patternId: z.string().regex(/^pat_[0-9a-f]{16}$/) })
    .strict(),
]);

type AssertTrue<T extends true> = T;
export type InputInSync = AssertTrue<
  z.infer<typeof InputSchema> extends PatternDecision
    ? PatternDecision extends z.infer<typeof InputSchema>
      ? true
      : false
    : false
>;

export async function decidePatternHandler(
  request: CallableRequest<unknown>,
  decider: PatternDecider = firestoreDecider(),
): Promise<PatternDecisionResult> {
  if (request.auth === undefined) throw new HttpsError('unauthenticated', 'Sign in required');
  if (request.auth.token['admin'] !== true) throw new HttpsError('permission-denied', 'Owner only');
  const input = InputSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError(
      'invalid-argument',
      'A decision and a proposal or pattern id are required',
    );
  const result = await decider(input.data, request.auth.uid);
  const target = input.data.decision === 'retire' ? input.data.patternId : input.data.proposalId;
  logger.info('decidePattern', { decision: input.data.decision, target, ...result });
  return result;
}

export const decidePattern = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    maxInstances: 2,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  (request) => decidePatternHandler(request),
);
