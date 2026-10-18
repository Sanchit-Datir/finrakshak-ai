import {
  GetProfileResultSchema,
  type GetProfileResult,
  type UserProfile,
} from '@fund-tracker/shared';
import type { CloudSession } from '../../state/session.js';
import type { Cloud } from './firebase.js';

/**
 * Asks the server for the signed-in person's profile. The browser cannot read the profile collection
 * directly (and does not ship Firestore); the function reads it with the verified user ID.
 */
export async function fetchProfile(cloud: Cloud): Promise<GetProfileResult> {
  const { httpsCallable } = await import('@firebase/functions');
  const call = httpsCallable(cloud.functions, 'getProfile');
  const response = await call();
  return GetProfileResultSchema.parse(response.data);
}

/** The app session for a signed-in person with a usable profile. */
export function profileToSession(
  uid: string,
  email: string | null,
  profile: UserProfile,
  remember: boolean,
  now: Date = new Date(),
): CloudSession {
  return {
    name: profile.name,
    employeeId: profile.employeeId,
    role: profile.role,
    branchId: profile.branchId,
    signedInAt: now.toISOString(),
    remember,
    demo: false,
    uid,
    email,
    aiEnabled: profile.aiEnabled,
  };
}
