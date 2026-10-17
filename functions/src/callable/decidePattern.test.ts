import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import { decidePatternHandler } from './decidePattern.js';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const OWNER = { uid: 'owner-uid', token: { admin: true } };

function req(
  data: unknown,
  auth: { uid: string; token: Record<string, unknown> } | null = OWNER,
): CallableRequest<unknown> {
  return { data, auth: auth ?? undefined } as unknown as CallableRequest<unknown>;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpsError) return error.code;
    throw error;
  }
  return 'ok';
}

const decider = vi.fn(() => Promise.resolve({ status: 'approved' as const, libraryVersion: 1 }));
const approve = { decision: 'approve', proposalId: 'pp_1' };

describe('decidePattern (B-06, B-61)', () => {
  it('rejects a signed-out caller first, then anyone without the boolean admin claim', async () => {
    expect(await codeOf(decidePatternHandler(req(approve, null), decider))).toBe('unauthenticated');
    for (const token of [{}, { admin: 'true' }, { admin: false }])
      expect(await codeOf(decidePatternHandler(req(approve, { uid: 'u', token }), decider))).toBe(
        'permission-denied',
      );
    expect(decider).not.toHaveBeenCalled();
  });

  it('rejects malformed input before reading anything', async () => {
    for (const bad of [
      {},
      { decision: 'auto_approve', proposalId: 'pp_1' },
      { decision: 'retire', proposalId: 'pp_1' },
      { ...approve, decided_by: 'agent' },
      { decision: 'approve', proposalId: '../current' },
    ])
      expect(await codeOf(decidePatternHandler(req(bad), decider))).toBe('invalid-argument');
    expect(decider).not.toHaveBeenCalled();
  });

  it('passes the validated decision and the caller’s own uid to the service', async () => {
    expect(await decidePatternHandler(req(approve), decider)).toEqual({
      status: 'approved',
      libraryVersion: 1,
    });
    expect(decider).toHaveBeenCalledWith(approve, 'owner-uid');
  });
});
