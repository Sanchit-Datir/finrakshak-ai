import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { RATE_LIMITS, RATE_WINDOW_MS } from '../config/limits.js';
import { defaultProfileStore, type ProfileStore, type UserProfile } from '../services/profiles.js';
import { createRateLimiter, type RateLimiter } from '../services/rate-limit.js';

export interface GetProfileResult {
  uid: string;
  email: string | null;
  /** Null means "signed in, but no usable profile": the app shows "account not set up". */
  profile: UserProfile | null;
}

/** Shared by every request this instance serves. */
const getProfileLimiter = createRateLimiter({
  limit: RATE_LIMITS.getProfilePerMinute,
  windowMs: RATE_WINDOW_MS,
});

/** Exported separately so it can be unit-tested without the Functions runtime. */
export async function getProfileHandler(
  request: CallableRequest<unknown>,
  store: ProfileStore = defaultProfileStore(),
  limiter: RateLimiter = getProfileLimiter,
): Promise<GetProfileResult> {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const rate = limiter.check(request.auth.uid);
  if (!rate.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Too many requests. Wait ${String(rate.retryAfterSeconds)} seconds and try again.`,
      { reason: 'rate_limit', retryAfterSeconds: rate.retryAfterSeconds },
    );
  }
  // Only ever the caller's own profile: the ID comes from the verified token, never from the request.
  const email = typeof request.auth.token.email === 'string' ? request.auth.token.email : null;
  return { uid: request.auth.uid, email, profile: await store.get(request.auth.uid, email) };
}

export const getProfile = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    maxInstances: 5,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  (request) => getProfileHandler(request),
);
