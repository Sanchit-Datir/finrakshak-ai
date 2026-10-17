import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../config/env.js';
import { accessFromProfiles } from './access.js';
import {
  defaultProfileStore,
  devProfileStore,
  firestoreProfileStore,
  type ProfileStore,
  type UserProfile,
} from './profiles.js';

const docGet = vi.hoisted(() => vi.fn());
const docId = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => {
        docId(name, id);
        return { get: docGet };
      },
    }),
  }),
}));
vi.mock('firebase-functions', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

function snapshot(data: unknown): unknown {
  return { exists: data !== undefined, data: () => data };
}

const VALID = {
  name: 'Anjali Patil',
  employeeId: 'EMP-10233',
  branchId: 'br-shirur',
  role: 'branch_manager',
};

beforeEach(() => {
  docGet.mockReset();
  docId.mockReset();
  resetEnvCache();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('firestoreProfileStore', () => {
  it('reads users/{uid} and applies safe defaults: AI off, enabled on', async () => {
    docGet.mockResolvedValue(snapshot(VALID));
    const profile = await firestoreProfileStore.get('uid-1', null);
    expect(docId).toHaveBeenCalledWith('users', 'uid-1');
    expect(profile).toEqual({ ...VALID, aiEnabled: false, enabled: true });
  });

  it('returns the AI flag when the owner has turned it on', async () => {
    docGet.mockResolvedValue(snapshot({ ...VALID, aiEnabled: true }));
    expect((await firestoreProfileStore.get('u', null))?.aiEnabled).toBe(true);
  });

  it('returns null when there is no profile', async () => {
    docGet.mockResolvedValue(snapshot(undefined));
    expect(await firestoreProfileStore.get('u', null)).toBeNull();
  });

  it('returns null for a person switched off with enabled: false', async () => {
    docGet.mockResolvedValue(snapshot({ ...VALID, aiEnabled: true, enabled: false }));
    expect(await firestoreProfileStore.get('u', null)).toBeNull();
  });

  it.each([
    ['unknown role', { ...VALID, role: 'superuser' }],
    ['missing name', { ...VALID, name: '' }],
    ['missing branch', { ...VALID, branchId: undefined }],
    ['aiEnabled typed as text', { ...VALID, aiEnabled: 'yes' }],
    ['enabled typed as text', { ...VALID, enabled: 'false' }],
    ['not an object', 'oops'],
  ])('fails closed on a malformed document: %s', async (_label, data) => {
    docGet.mockResolvedValue(snapshot(data));
    expect(await firestoreProfileStore.get('u', null)).toBeNull();
  });
});

describe('devProfileStore and the default choice', () => {
  it('builds a fixed profile from the email, with AI on', async () => {
    const profile = await devProfileStore.get('u', 'officer@example.com');
    expect(profile).toMatchObject({ name: 'officer', role: 'branch_manager', aiEnabled: true });
  });

  it('is never chosen for a deployed function', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FUNCTIONS_EMULATOR', '');
    expect(defaultProfileStore()).toBe(firestoreProfileStore);
  });

  it('needs no Gemini settings: getProfile has no Gemini key attached in production', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FUNCTIONS_EMULATOR', '');
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GCLOUD_PROJECT', undefined);
    expect(() => defaultProfileStore()).not.toThrow();
  });

  it('is used locally when there is no Firestore emulator, so real data is never read', () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    expect(defaultProfileStore()).toBe(devProfileStore);
  });

  it('uses Firestore locally when a Firestore emulator is running', () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
    expect(defaultProfileStore()).toBe(firestoreProfileStore);
  });
});

describe('accessFromProfiles', () => {
  const storeWith = (profile: UserProfile | null): ProfileStore => ({
    get: () => Promise.resolve(profile),
  });
  const base: UserProfile = { ...VALID, role: 'branch_manager', aiEnabled: true, enabled: true };

  it('allows only a profile with aiEnabled true', async () => {
    expect(await accessFromProfiles(storeWith(base)).isAllowed('u')).toBe(true);
    expect(await accessFromProfiles(storeWith({ ...base, aiEnabled: false })).isAllowed('u')).toBe(
      false,
    );
  });

  it('refuses someone with no usable profile', async () => {
    expect(await accessFromProfiles(storeWith(null)).isAllowed('u')).toBe(false);
  });
});
