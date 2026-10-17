import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firestoreAccessStore } from './access.js';

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

function snapshot(data: Record<string, unknown> | undefined): unknown {
  return { exists: data !== undefined, get: (field: string) => data?.[field] };
}

beforeEach(() => {
  docGet.mockReset();
  docId.mockReset();
});

describe('firestoreAccessStore', () => {
  it('looks the user up by ID in allowedUsers', async () => {
    docGet.mockResolvedValue(snapshot({ email: 'a@b.c' }));
    await firestoreAccessStore().isAllowed('uid-1');
    expect(docId).toHaveBeenCalledWith('allowedUsers', 'uid-1');
  });

  it('allows a listed user, with or without an enabled flag', async () => {
    docGet.mockResolvedValue(snapshot({}));
    expect(await firestoreAccessStore().isAllowed('u')).toBe(true);
    docGet.mockResolvedValue(snapshot({ enabled: true }));
    expect(await firestoreAccessStore().isAllowed('u')).toBe(true);
  });

  it('refuses an unlisted user', async () => {
    docGet.mockResolvedValue(snapshot(undefined));
    expect(await firestoreAccessStore().isAllowed('u')).toBe(false);
  });

  it('refuses a user switched off with enabled: false', async () => {
    docGet.mockResolvedValue(snapshot({ enabled: false }));
    expect(await firestoreAccessStore().isAllowed('u')).toBe(false);
  });

  it('fails closed on unexpected values, so a typo never grants access', async () => {
    for (const odd of ['no', 'false', 0, null, 'true']) {
      docGet.mockResolvedValue(snapshot({ enabled: odd }));
      expect(await firestoreAccessStore().isAllowed('u'), String(odd)).toBe(false);
    }
  });
});
