import { HttpsError, onCall } from 'firebase-functions/v2/https';

/** Example callable showing the required pattern: auth check first, typed result. */
export const health = onCall(
  // Same cost guards as the other callables: a small instance cap and memory.
  { region: 'asia-south1', enforceAppCheck: true, maxInstances: 5, memory: '256MiB' },
  (request) => {
    if (request.auth === undefined) {
      throw new HttpsError('unauthenticated', 'Sign in required');
    }
    return { ok: true as const };
  },
);
