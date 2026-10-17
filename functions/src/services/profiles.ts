import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { getProfileSource } from '../config/env.js';

/** Must match UserProfileSchema in packages/shared (Cloud Build cannot install that package). */
export const ROLES = [
  'branch_officer',
  'branch_manager',
  'risk_analyst',
  'investigator',
  'administrator',
] as const;

/**
 * One document per person at `users/{Firebase user ID}`, written by the owner in the console.
 * Clients cannot read or write the collection (default-deny rules); they ask `getProfile`.
 */
export const UserProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  employeeId: z.string().trim().max(40).default(''),
  branchId: z.string().trim().min(1).max(60),
  role: z.enum(ROLES),
  /** May this person use billed AI features? Off unless the owner turns it on. */
  aiEnabled: z.boolean().default(false),
  /** Switch a person off without deleting their profile. */
  enabled: z.boolean().default(true),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export interface ProfileStore {
  /** The person's profile, or null when they have none, are switched off, or the document is invalid. */
  get(uid: string, email: string | null): Promise<UserProfile | null>;
}

export const firestoreProfileStore: ProfileStore = {
  async get(uid) {
    const snap = await getFirestore().collection('users').doc(uid).get();
    if (!snap.exists) return null;
    const parsed = UserProfileSchema.safeParse(snap.data());
    if (!parsed.success) {
      // Fail closed. Log only which fields are wrong, never their values.
      logger.warn('users document is not a valid profile', {
        uid,
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      return null;
    }
    return parsed.data.enabled ? parsed.data : null;
  },
};

/** Local runs only: a fixed profile so the emulator needs no Firestore. Never selected in production. */
export const devProfileStore: ProfileStore = {
  get(_uid, email) {
    return Promise.resolve({
      name: email?.split('@')[0] ?? 'Dev user',
      employeeId: 'DEV-001',
      branchId: 'br-shirur',
      role: 'branch_manager',
      aiEnabled: true,
      enabled: true,
    });
  },
};

export function defaultProfileStore(): ProfileStore {
  return getProfileSource() === 'dev' ? devProfileStore : firestoreProfileStore;
}
