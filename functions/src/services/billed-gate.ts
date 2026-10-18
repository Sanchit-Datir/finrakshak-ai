import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import type { AccessStore } from './access.js';
import { describeError } from './log.js';
import { consumeDailyQuota, type UsageStore } from './usage-limit.js';

export interface BilledGateDeps {
  readonly usage: UsageStore;
  readonly access: AccessStore;
}

/**
 * The checks before any billed model call (B-15): the account must be on the AI allow-list, then one
 * use is counted against today's limit. The allow-list runs first so unlisted accounts never create
 * usage records. Fails closed when either lookup fails. Returns the calls left today.
 */
export async function gateBilledCall(
  deps: BilledGateDeps,
  uid: string,
  dailyLimit: number,
  tag: string,
): Promise<number> {
  try {
    if (!(await deps.access.isAllowed(uid))) {
      logger.warn(`${tag}: refused, AI not enabled for this account`, { uid });
      throw new HttpsError(
        'permission-denied',
        'This account is not enabled for AI features. Ask an administrator.',
      );
    }
    const quota = await consumeDailyQuota(deps.usage, uid, dailyLimit);
    if (!quota.allowed) {
      logger.warn(`${tag}: refused, daily limit reached`, { uid });
      throw new HttpsError('resource-exhausted', 'Daily AI limit reached. Try again tomorrow.', {
        reason: 'daily_limit',
      });
    }
    return quota.remaining;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error(`${tag}: access or usage lookup failed`, { uid, ...describeError(error) });
    throw new HttpsError('internal', 'Could not check your access. Try again.', {
      reason: 'access_lookup_failed',
    });
  }
}

/** Logs a failed model call without the prompt or reply (B-16) and turns it into a retryable error. */
export function modelFailure(tag: string, error: Error): HttpsError {
  const cause = error.cause as { name?: string; status?: number; message?: string } | undefined;
  logger.error(`${tag}: model call failed`, {
    reason: error.message,
    causeName: cause?.name,
    causeStatus: cause?.status,
    causeMessage: cause?.message?.slice(0, 300),
  });
  return new HttpsError('unavailable', 'The AI service could not answer. Try again.');
}
