import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defaultProfileStore, type ProfileStore, type UserProfile } from '../services/profiles.js';

export interface GetProfileResult {
  uid: string;
  email: string | null;
  /** Null means "signed in, but no usable profile": the app shows "account not set up". */
  profile: UserProfile | null;
}

/** Exported separately so it can be unit-tested without the Functions runtime. */
export async function getProfileHandler(
  request: CallableRequest<unknown>,
  store: ProfileStore = defaultProfileStore(),
): Promise<GetProfileResult> {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in required');
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
