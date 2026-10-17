import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { cloudDataHeaders, type DataCredentialsSource } from './data-access.js';
import type { Cloud } from './firebase.js';

function fakeCloud(options: {
  idToken?: string | null;
  appCheck?: string | null;
}): DataCredentialsSource & { getIdToken: () => Promise<string> } {
  const getIdToken = vi.fn(() => Promise.resolve(options.idToken ?? 'id-token'));
  return {
    auth: { currentUser: options.idToken === null ? null : { getIdToken } },
    appCheckToken: vi.fn(() => Promise.resolve(options.appCheck ?? null)),
    getIdToken,
  };
}

describe('cloudDataHeaders', () => {
  it('the real Cloud connection can be passed in', () => {
    expectTypeOf<Cloud>().toExtend<DataCredentialsSource>();
  });

  it('returns no headers, and asks for no tokens, when nobody is signed in', async () => {
    const cloud = fakeCloud({ idToken: null, appCheck: 'app-check' });
    await expect(cloudDataHeaders(cloud)).resolves.toEqual({});
    expect(cloud.appCheckToken).not.toHaveBeenCalled();
  });

  it('sends the ID token as a Bearer token, with the App Check token', async () => {
    const cloud = fakeCloud({ idToken: 'id-123', appCheck: 'ac-456' });
    await expect(cloudDataHeaders(cloud)).resolves.toEqual({
      Authorization: 'Bearer id-123',
      'X-Firebase-AppCheck': 'ac-456',
    });
  });

  it('omits the App Check header when no App Check token is available', async () => {
    const headers = await cloudDataHeaders(fakeCloud({ idToken: 'id-123', appCheck: null }));
    expect(headers).toEqual({ Authorization: 'Bearer id-123' });
    expect('X-Firebase-AppCheck' in headers).toBe(false);
  });

  it('uses the cached ID token (no forced refresh on every request)', async () => {
    const cloud = fakeCloud({ idToken: 'id-123' });
    await cloudDataHeaders(cloud);
    expect(cloud.getIdToken).toHaveBeenCalledWith();
  });

  it('passes on a failure to get the ID token, so the caller can fall back', async () => {
    const cloud: DataCredentialsSource = {
      auth: { currentUser: { getIdToken: () => Promise.reject(new Error('network')) } },
      appCheckToken: () => Promise.resolve('ac'),
    };
    await expect(cloudDataHeaders(cloud)).rejects.toThrow('network');
  });
});
