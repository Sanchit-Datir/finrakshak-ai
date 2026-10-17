import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileStore, UserProfile } from '../services/profiles.js';
import { getProfileHandler } from './getProfile.js';

const PROFILE: UserProfile = {
  name: 'Anjali Patil',
  employeeId: 'EMP-10233',
  branchId: 'br-shirur',
  role: 'branch_manager',
  aiEnabled: false,
  enabled: true,
};

function req(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
): CallableRequest<unknown> {
  return { data: undefined, auth } as unknown as CallableRequest<unknown>;
}

describe('getProfileHandler', () => {
  it('rejects callers who are not signed in, without touching the store', async () => {
    const get = vi.fn();
    const error = await getProfileHandler(req(undefined), { get }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('unauthenticated');
    expect(get).not.toHaveBeenCalled();
  });

  it("returns the caller's own profile, using the ID and email from the verified token", async () => {
    const get = vi.fn().mockResolvedValue(PROFILE);
    const store: ProfileStore = { get };
    const result = await getProfileHandler(req({ uid: 'u1', token: { email: 'a@b.c' } }), store);
    expect(get).toHaveBeenCalledWith('u1', 'a@b.c');
    expect(result).toEqual({ uid: 'u1', email: 'a@b.c', profile: PROFILE });
  });

  it('returns a null profile (account not set up) rather than an error', async () => {
    const store: ProfileStore = { get: () => Promise.resolve(null) };
    expect(await getProfileHandler(req({ uid: 'u2', token: {} }), store)).toEqual({
      uid: 'u2',
      email: null,
      profile: null,
    });
  });

  it('ignores a non-string email claim', async () => {
    const store: ProfileStore = { get: () => Promise.resolve(null) };
    const result = await getProfileHandler(req({ uid: 'u3', token: { email: 42 } }), store);
    expect(result.email).toBeNull();
  });
});
