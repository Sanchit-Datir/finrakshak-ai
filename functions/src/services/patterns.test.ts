import { readFileSync } from 'node:fs';
import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import { contentHashOf, decide, firestoreDecider } from './patterns.js';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

interface Lib {
  library_version: number;
  content_hash: string;
  patterns: Record<string, unknown>[];
}

/** The shared contract fixture (PATTERN_CONTRACT.md, section 9): its content_hash is real. */
const SAMPLE = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/shared/src/risk/patterns/fixtures/library.sample.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Lib;
const NOW = new Date('2026-10-17T05:30:00.000Z');
const NEW_ID = 'pat_00000000000000aa';
const minerPattern = SAMPLE.patterns.find(
  (p) => p['origin'] === 'miner' && p['status'] === 'approved',
);
if (minerPattern === undefined) throw new Error('fixture must hold an approved miner pattern');
const draft = {
  ...minerPattern,
  pattern_id: NEW_ID,
  status: 'draft',
  approved_by: null,
  approved_at: null,
};
const proposal = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  status: 'proposed',
  expires_at: '2026-11-16T05:30:00.000Z',
  pattern: draft,
  ...over,
});

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpsError) return e.code;
    throw e;
  }
  return 'ok';
};
const approve = { decision: 'approve', proposalId: 'pp_1' } as const;
const reject = { decision: 'reject', proposalId: 'pp_1' } as const;

describe('canonical content hash', () => {
  it('reproduces the shared fixture hash exactly (same rule as packages/shared)', () => {
    expect(contentHashOf(SAMPLE.patterns)).toBe(SAMPLE.content_hash);
  });
});

describe('decide: approve and reject', () => {
  it('approve copies the exact pattern into a new library version', () => {
    const { writes, result } = decide(
      approve,
      { proposal: proposal(), library: SAMPLE },
      'u1',
      NOW,
    );
    expect(result).toEqual({ status: 'approved', libraryVersion: SAMPLE.library_version + 1 });
    const lib = writes.library;
    expect(lib?.patterns.map((p) => p.pattern_id)).toEqual(
      [NEW_ID, ...SAMPLE.patterns.map((p) => p['pattern_id'])].sort(),
    );
    expect(lib && contentHashOf(lib.patterns)).toBe(lib?.content_hash);
    expect(lib?.patterns.find((p) => p.pattern_id === NEW_ID)).toEqual({
      ...draft,
      status: 'approved',
      approved_by: 'u1',
      approved_at: NOW.toISOString(),
    });
    expect(writes.proposal).toEqual({
      status: 'approved',
      decided_at: NOW.toISOString(),
      decided_by: 'u1',
    });
  });

  it('starts an empty library at version 1, and reject never touches the library', () => {
    expect(decide(approve, { proposal: proposal(), library: undefined }, 'u1', NOW).result).toEqual(
      {
        status: 'approved',
        libraryVersion: 1,
      },
    );
    const rejected = decide(reject, { proposal: proposal(), library: SAMPLE }, 'u1', NOW);
    expect(rejected.writes.library).toBeNull();
    expect(rejected.result).toEqual({ status: 'rejected', libraryVersion: null });
  });

  it.each([
    ['unknown proposal', approve, undefined, SAMPLE, 'not-found'],
    ['malformed proposal', approve, { status: 'proposed' }, SAMPLE, 'failed-precondition'],
    ['already decided', approve, proposal({ status: 'approved' }), SAMPLE, 'failed-precondition'],
    [
      'expired approve',
      approve,
      proposal({ expires_at: NOW.toISOString() }),
      SAMPLE,
      'failed-precondition',
    ],
    ['expired reject', reject, proposal({ expires_at: NOW.toISOString() }), SAMPLE, 'ok'],
    [
      'already in library',
      approve,
      proposal({ pattern: { ...draft, pattern_id: minerPattern['pattern_id'] } }),
      SAMPLE,
      'failed-precondition',
    ],
    [
      'hand-edited library',
      approve,
      proposal(),
      { ...SAMPLE, content_hash: 'f'.repeat(64) },
      'failed-precondition',
    ],
  ] as const)('%s', (_label, input, prop, library, code) => {
    expect(codeOf(() => decide(input, { proposal: prop, library }, 'u1', NOW))).toBe(code);
  });
});

describe('decide: retire', () => {
  const approvedId = String(minerPattern['pattern_id']);
  const retiredId = String(SAMPLE.patterns.find((p) => p['status'] === 'retired')?.['pattern_id']);
  const retire = (patternId: string): { decision: 'retire'; patternId: string } => ({
    decision: 'retire',
    patternId,
  });

  it('retires an approved pattern in a new version and keeps it for history', () => {
    const { writes, result } = decide(
      retire(approvedId),
      { proposal: undefined, library: SAMPLE },
      'u1',
      NOW,
    );
    expect(result).toEqual({ status: 'retired', libraryVersion: SAMPLE.library_version + 1 });
    expect(writes.library?.patterns).toHaveLength(SAMPLE.patterns.length);
    expect(writes.library?.patterns.find((p) => p.pattern_id === approvedId)).toMatchObject({
      status: 'retired',
      retired_at: NOW.toISOString(),
    });
  });

  it('refuses a retired, unknown or missing pattern', () => {
    const state = { proposal: undefined, library: SAMPLE };
    expect(codeOf(() => decide(retire(retiredId), state, 'u1', NOW))).toBe('failed-precondition');
    expect(codeOf(() => decide(retire(NEW_ID), state, 'u1', NOW))).toBe('not-found');
    expect(codeOf(() => decide(retire(NEW_ID), { ...state, library: undefined }, 'u1', NOW))).toBe(
      'not-found',
    );
  });
});

describe('firestoreDecider', () => {
  it('reads both documents in one transaction, updates the proposal and writes current and v<n>', async () => {
    const ops: string[] = [];
    const docs = new Map<string, unknown>([
      ['patternProposals/pp_1', proposal()],
      ['riskPatternLibrary/current', SAMPLE],
    ]);
    const ref = (path: string): { path: string } => ({ path });
    const tx = {
      get: (r: { path: string }) =>
        Promise.resolve({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
      update: (r: { path: string }) => ops.push(`update ${r.path}`),
      set: (r: { path: string }) => ops.push(`set ${r.path}`),
      create: (r: { path: string }) => ops.push(`create ${r.path}`),
    };
    const db = {
      collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
      runTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const decider = firestoreDecider(db as unknown as Parameters<typeof firestoreDecider>[0]);
    expect(await decider(approve, 'u1')).toEqual({ status: 'approved', libraryVersion: 8 });
    expect(ops).toEqual([
      'update patternProposals/pp_1',
      'set riskPatternLibrary/current',
      'create riskPatternLibrary/v8',
    ]);
  });
});
