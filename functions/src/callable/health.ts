import { HttpsError, onCall } from 'firebase-functions/v2/https';

/** Example callable showing the required pattern: auth check first, typed result. */
export const health = onCall({ region: 'us-central1', enforceAppCheck: true }, (request) => {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  return { ok: true as const };
});
