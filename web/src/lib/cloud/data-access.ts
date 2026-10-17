import type { Cloud } from './firebase.js';

/** The narrow part of `Cloud` this needs, so it can be tested without Firebase. */
export type DataCredentialsSource = Pick<Cloud, 'appCheckToken'> & {
  auth: { currentUser: { getIdToken: () => Promise<string> } | null };
};

/**
 * Headers for the cloud-published public records (`/data/public-records/`): the signed-in user's
 * Firebase ID token and an App Check token, which the `publicData` function verifies.
 */
export async function cloudDataHeaders(cloud: DataCredentialsSource): Promise<Record<string, string>> {
  const user = cloud.auth.currentUser;
  if (user === null) return {};
  const [idToken, appCheck] = await Promise.all([user.getIdToken(), cloud.appCheckToken()]);
  return {
    Authorization: `Bearer ${idToken}`,
    ...(appCheck === null ? {} : { 'X-Firebase-AppCheck': appCheck }),
  };
}
