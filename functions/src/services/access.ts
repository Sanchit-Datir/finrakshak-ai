import { getFirestore } from 'firebase-admin/firestore';

/**
 * Who may use billed AI features. Allowed accounts are documents in `allowedUsers`, keyed by
 * Firebase Auth user ID (NOT email: anyone can register with any email address, but nobody can
 * choose their own user ID). Clients cannot read or write the collection (default-deny rules);
 * the owner manages it in the Firebase console, see docs/DEPLOY.md.
 */
export interface AccessStore {
  isAllowed(uid: string): Promise<boolean>;
}

export function firestoreAccessStore(): AccessStore {
  return {
    async isAllowed(uid) {
      const snap = await getFirestore().collection('allowedUsers').doc(uid).get();
      if (!snap.exists) return false;
      // Present means allowed. `enabled: false` switches someone off without deleting; any other
      // unexpected value also refuses, so a typo can never grant access.
      const enabled: unknown = snap.get('enabled');
      return enabled === undefined || enabled === true;
    },
  };
}
