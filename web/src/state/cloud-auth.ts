import type { UserProfile } from '@fund-tracker/shared';
import { useSyncExternalStore } from 'react';
import { cloudDataHeaders } from '../lib/cloud/data-access.js';
import { explainCloudError } from '../lib/cloud/errors.js';
import { cloudConfig, connectCloud, type Cloud } from '../lib/cloud/firebase.js';
import { fetchProfile, profileToSession } from '../lib/cloud/profile.js';
import { setDataHeadersProvider } from '../lib/graph-lab.js';
import { resetPublicRecords } from '../lib/public-records.js';
import { registerSignOutHook, setCloudSession } from './session.js';
import { mutate } from './store.js';

/**
 * Real sign-in (Firebase email + password) and the person's profile. Everything here is inert, and
 * the app behaves as the plain demo, when the build has no Firebase settings (status "off").
 */
export type CloudAuthState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in with Firebase, but no usable profile: the owner has not set this person up. */
  | { status: 'needs-setup'; uid: string; email: string | null }
  /** Signed in, but the profile could not be loaded (for example App Check is refusing this site). */
  | { status: 'error'; message: string }
  | { status: 'ready'; cloud: Cloud; uid: string; email: string | null; profile: UserProfile };

const CONFIG = cloudConfig();
let state: CloudAuthState = CONFIG === null ? { status: 'off' } : { status: 'loading' };
const listeners = new Set<() => void>();
let started = false;
let rememberNext = true;
/** Ignores a profile that arrives after the person has already signed out or in as someone else. */
let generation = 0;

function set(next: CloudAuthState): void {
  // Cloud-published public records need a signed-in, set-up user; otherwise the local copy is used.
  if ((next.status === 'ready') !== (state.status === 'ready')) resetPublicRecords();
  setDataHeadersProvider(next.status === 'ready' ? () => cloudDataHeaders(next.cloud) : null);
  state = next;
  for (const l of listeners) l();
}

export function useCloudAuth(): CloudAuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );
}

async function onUser(
  cloud: Cloud,
  user: { uid: string; email: string | null } | null,
): Promise<void> {
  const mine = ++generation;
  if (user === null) {
    setCloudSession(null);
    set({ status: 'signed-out' });
    return;
  }
  set({ status: 'loading' });
  try {
    const result = await fetchProfile(cloud);
    if (mine !== generation) return;
    if (result.profile === null) {
      setCloudSession(null);
      set({ status: 'needs-setup', uid: result.uid, email: result.email });
      return;
    }
    const { profile } = result;
    // The rest of the prototype shows the profile held in its local store; keep it in step.
    mutate((d) => {
      d.settings.profile = {
        name: profile.name,
        employeeId: profile.employeeId,
        email: result.email ?? '',
        role: profile.role,
        branchId: profile.branchId,
      };
    });
    setCloudSession(profileToSession(result.uid, result.email, profile, rememberNext));
    set({ status: 'ready', cloud, uid: result.uid, email: result.email, profile });
  } catch (error) {
    if (mine !== generation) return;
    setCloudSession(null);
    set({ status: 'error', message: explainCloudError(error) });
  }
}

/** Start listening for sign-in changes. Safe to call more than once; does nothing without settings. */
export function initCloudAuth(): void {
  if (CONFIG === null || started) return;
  started = true;
  registerSignOutHook(() => {
    void signOutCloud();
  });
  connectCloud(CONFIG)
    .then(async (cloud) => {
      const { onAuthStateChanged } = await import('@firebase/auth');
      onAuthStateChanged(cloud.auth, (user) => {
        void onUser(cloud, user === null ? null : { uid: user.uid, email: user.email });
      });
    })
    .catch(() => {
      set({
        status: 'error',
        message: 'Could not start the sign-in service. Reload and try again.',
      });
    });
}

/** Sign in with an email and password. Throws a Firebase error; callers show explainCloudError. */
export async function signInWithPassword(
  email: string,
  password: string,
  remember: boolean,
): Promise<void> {
  if (CONFIG === null) throw new Error('Cloud sign-in is not configured');
  const cloud = await connectCloud(CONFIG);
  const auth = await import('@firebase/auth');
  rememberNext = remember;
  await auth.setPersistence(
    cloud.auth,
    remember ? auth.indexedDBLocalPersistence : auth.browserSessionPersistence,
  );
  await auth.signInWithEmailAndPassword(cloud.auth, email.trim(), password);
}

export async function signOutCloud(): Promise<void> {
  if (CONFIG === null) return;
  try {
    const cloud = await connectCloud(CONFIG);
    const { signOut } = await import('@firebase/auth');
    await signOut(cloud.auth);
  } catch {
    // Nothing useful to show: the local session is already cleared by endSession().
  }
}
