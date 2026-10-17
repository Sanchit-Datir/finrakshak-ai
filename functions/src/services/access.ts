import type { ProfileStore } from './profiles.js';

/**
 * Who may use billed AI features: people whose profile (`users/{user ID}`) exists, is enabled and has
 * `aiEnabled: true`. Keyed by Firebase user ID, never by email: anyone can register with any email
 * address, but nobody can choose their own user ID.
 */
export interface AccessStore {
  isAllowed(uid: string): Promise<boolean>;
}

export function accessFromProfiles(profiles: ProfileStore): AccessStore {
  return {
    async isAllowed(uid) {
      const profile = await profiles.get(uid, null);
      return profile?.aiEnabled === true;
    },
  };
}
