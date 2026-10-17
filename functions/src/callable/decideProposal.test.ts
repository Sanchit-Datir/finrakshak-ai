import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideProposalHandler } from './decideProposal.js';

interface DocRef {
  readonly path: string;
}

const tx = vi.hoisted(() => ({
  get: vi.fn<(ref: DocRef) => Promise<{ exists: boolean; data: () => unknown }>>(),
  update: vi.fn<(ref: DocRef, data: Record<string, unknown>) => void>(),
}));
const runTransaction = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({ doc: (id: string): DocRef => ({ path: `${name}/${id}` }) }),
    runTransaction,
  }),
}));
vi.mock('firebase-functions', () => ({ logger: { info: logInfo, warn: vi.fn(), error: vi.fn() } }));

const docs = new Map<string, unknown>();
const NOW = new Date('2026-10-17T05:30:00.000Z');
const OWNER = { uid: 'owner-uid', token: { admin: true } };

/** `auth: null` means signed out (the runtime then leaves `request.auth` undefined). */
function req(
  data: unknown,
  auth: { uid: string; token: Record<string, unknown> } | null = OWNER,
): CallableRequest<unknown> {
  return { data, auth: auth ?? undefined } as unknown as CallableRequest<unknown>;
}

/** The HttpsError code a call fails with, or 'ok'. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpsError) return error.code;
    throw error;
  }
  return 'ok';
}

const FUTURE = '2026-10-24T05:30:00.000Z';

function store(id: string, status: string, action = 'rerun_source', expires_at = FUTURE): void {
  docs.set(`agentProposals/${id}`, {
    status,
    action,
    reason: 'IBBI listing failed twice',
    expires_at,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  docs.clear();
  tx.get.mockReset();
  tx.get.mockImplementation((ref) => {
    const data = docs.get(ref.path);
    return Promise.resolve({ exists: data !== undefined, data: () => data });
  });
  tx.update.mockReset();
  runTransaction.mockReset();
  runTransaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  logInfo.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('decideProposalHandler: who may decide', () => {
  it('rejects callers who are not signed in, before reading anything', async () => {
    store('p1', 'proposed');
    const call = decideProposalHandler(req({ proposalId: 'p1', decision: 'approve' }, null));
    expect(await codeOf(call)).toBe('unauthenticated');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['no admin claim', {}],
    ['admin: false', { admin: false }],
    ['admin as text', { admin: 'true' }],
    ['admin as a number', { admin: 1 }],
  ])('rejects a signed-in user with %s', async (_label, token) => {
    store('p1', 'proposed');
    const call = decideProposalHandler(
      req({ proposalId: 'p1', decision: 'approve' }, { uid: 'u2', token }),
    );
    expect(await codeOf(call)).toBe('permission-denied');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('checks the owner before validating input, so strangers learn nothing about it', async () => {
    const call = decideProposalHandler(req({}, { uid: 'u2', token: {} }));
    expect(await codeOf(call)).toBe('permission-denied');
  });
});

describe('decideProposalHandler: input', () => {
  it.each([
    undefined,
    null,
    'p1',
    {},
    { proposalId: 'p1' },
    { decision: 'approve' },
    { proposalId: 'p1', decision: 'apply' },
    { proposalId: 'p1', decision: 'APPROVE' },
    { proposalId: '', decision: 'approve' },
    { proposalId: '../p1', decision: 'approve' },
    { proposalId: 'agentProposals/p1', decision: 'approve' },
    { proposalId: 'p 1', decision: 'approve' },
    { proposalId: 'a'.repeat(121), decision: 'approve' },
    { proposalId: 42, decision: 'approve' },
  ])('rejects %j as invalid-argument without reading Firestore', async (data) => {
    expect(await codeOf(decideProposalHandler(req(data)))).toBe('invalid-argument');
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('accepts the longest valid id', async () => {
    const id = 'a'.repeat(120);
    store(id, 'proposed');
    expect(await codeOf(decideProposalHandler(req({ proposalId: id, decision: 'approve' })))).toBe(
      'ok',
    );
  });
});

describe('decideProposalHandler: stored proposal', () => {
  it('answers not-found for a proposal that does not exist', async () => {
    const call = decideProposalHandler(req({ proposalId: 'missing', decision: 'approve' }));
    expect(await codeOf(call)).toBe('not-found');
    expect(tx.get).toHaveBeenCalledWith({ path: 'agentProposals/missing' });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown status', { status: 'done', action: 'rerun_source', expires_at: FUTURE }],
    ['no action', { status: 'proposed', expires_at: FUTURE }],
    ['a non-string action', { status: 'proposed', action: 7, expires_at: FUTURE }],
    ['no expiry', { status: 'proposed', action: 'rerun_source' }],
    ['an expiry that is not a timestamp', { status: 'proposed', action: 'x', expires_at: 'soon' }],
    ['no fields', {}],
    ['a non-object', 'proposed'],
  ])('rejects a stored proposal with %s as malformed', async (_label, data) => {
    docs.set('agentProposals/p1', data);
    const error = await decideProposalHandler(req({ proposalId: 'p1', decision: 'approve' })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpsError);
    expect(error instanceof HttpsError ? [error.code, error.message] : null).toEqual([
      'failed-precondition',
      'Proposal is malformed',
    ]);
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('decideProposalHandler: transitions (B-49)', () => {
  it.each([
    ['approve', 'proposed', 'rerun_source', 'approved'],
    ['reject', 'proposed', 'rerun_source', 'rejected'],
    ['reject', 'auto_approved', 'rerun_source', 'rejected'],
    ['resolve', 'proposed', 'adapter_fix_needed', 'resolved'],
    ['resolve', 'approved', 'full_relist', 'resolved'],
    ['resolve', 'applied', 'pause_source', 'resolved'],
  ])('%s turns a %s %s proposal into %s', async (decision, current, action, next) => {
    store('p1', current, action);
    await expect(decideProposalHandler(req({ proposalId: 'p1', decision }))).resolves.toEqual({
      status: next,
    });
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(
      { path: 'agentProposals/p1' },
      { status: next, decided_at: NOW.toISOString(), decided_by: 'owner-uid' },
    );
  });

  it.each([
    ['approve', 'auto_approved', 'rerun_source'],
    ['approve', 'approved', 'rerun_source'],
    ['approve', 'rejected', 'rerun_source'],
    ['approve', 'applied', 'rerun_source'],
    ['approve', 'expired', 'rerun_source'],
    ['approve', 'resolved', 'rerun_source'],
    ['reject', 'approved', 'rerun_source'],
    ['reject', 'rejected', 'rerun_source'],
    ['reject', 'applied', 'pause_source'],
    ['reject', 'expired', 'rerun_source'],
    ['reject', 'resolved', 'rerun_source'],
    ['resolve', 'auto_approved', 'rerun_source'],
    ['resolve', 'rejected', 'rerun_source'],
    ['resolve', 'applied', 'rerun_source'],
    ['resolve', 'applied', 'rollback_publish'],
    ['resolve', 'expired', 'pause_source'],
    ['resolve', 'resolved', 'pause_source'],
  ])('refuses to %s a %s %s proposal and writes nothing', async (decision, current, action) => {
    store('p1', current, action);
    const error = await decideProposalHandler(req({ proposalId: 'p1', decision })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpsError);
    expect(error instanceof HttpsError ? error.code : null).toBe('failed-precondition');
    expect(error instanceof HttpsError ? error.message : '').toContain(`Cannot ${decision}`);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('refuses to approve a proposal past its deadline, but still lets the owner reject it', async () => {
    store('p1', 'proposed', 'full_relist', NOW.toISOString());
    const error = await decideProposalHandler(req({ proposalId: 'p1', decision: 'approve' })).catch(
      (e: unknown) => e,
    );
    expect(error instanceof HttpsError ? [error.code, error.message] : null).toEqual([
      'failed-precondition',
      'This proposal has expired',
    ]);
    expect(tx.update).not.toHaveBeenCalled();
    await expect(
      decideProposalHandler(req({ proposalId: 'p1', decision: 'reject' })),
    ).resolves.toEqual({ status: 'rejected' });
  });

  it('names the current status in plain words when a decision is not allowed', async () => {
    store('p1', 'auto_approved');
    await expect(
      decideProposalHandler(req({ proposalId: 'p1', decision: 'approve' })),
    ).rejects.toThrow('Cannot approve a proposal that is auto approved');
  });

  it('reads and writes inside one transaction, so two owners cannot both decide', async () => {
    store('p1', 'proposed');
    await decideProposalHandler(req({ proposalId: 'p1', decision: 'approve' }));
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(tx.get).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it('logs the decision without the owner’s user ID', async () => {
    store('p1', 'proposed');
    await decideProposalHandler(req({ proposalId: 'p1', decision: 'reject' }));
    expect(logInfo).toHaveBeenCalledWith('decideProposal', {
      proposalId: 'p1',
      decision: 'reject',
      status: 'rejected',
    });
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain('owner-uid');
  });

  it('passes on a Firestore failure and logs no decision', async () => {
    runTransaction.mockRejectedValue(new Error('aborted'));
    await expect(
      decideProposalHandler(req({ proposalId: 'p1', decision: 'approve' })),
    ).rejects.toThrow('aborted');
    expect(logInfo).not.toHaveBeenCalled();
  });
});
