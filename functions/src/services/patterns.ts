import { createHash } from 'node:crypto';
import type {
  Pattern,
  PatternDecision,
  PatternDecisionResult,
  PatternLibrary,
} from '@finrakshak-ai/shared';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

/**
 * Applies an administrator's decision on a pattern (PATTERN_MINER_PLAN.md, "Approval and use"; B-61):
 * approve copies the proposal's exact pattern into the library, reject closes the proposal, retire
 * stops a live pattern being used. Every change raises `library_version`, rewrites the content hash and
 * keeps an immutable `riskPatternLibrary/v<n>` copy, so any past score can be reproduced (B-57).
 * Functions deploy without workspace packages, so the canonical JSON and the narrow schemas are local
 * copies; the type checks and a fixture test keep them in step with packages/shared.
 */

export const PROPOSALS_COLLECTION = 'patternProposals';
export const LIBRARY_COLLECTION = 'riskPatternLibrary';
export const LIBRARY_CURRENT = 'current';
/** B-18: a Firestore document holds at most 1 MiB; refuse well before it. */
const MAX_LIBRARY_CHARS = 900_000;

/** Same as `canonicalJson` in packages/shared: sorted keys, no whitespace, `undefined` left out. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('canonicalJson: number is not finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: cannot serialise a ${typeof value}`);
}

export const contentHashOf = (patterns: readonly unknown[]): string =>
  createHash('sha256').update(canonicalJson(patterns)).digest('hex');

const StoredPatternSchema = z
  .object({
    pattern_id: z.string().regex(/^pat_[0-9a-f]{16}$/),
    status: z.enum(['draft', 'approved', 'retired']),
  })
  .passthrough();
const StoredProposalSchema = z.object({
  status: z.enum(['proposed', 'approved', 'rejected', 'expired']),
  expires_at: z.string().datetime(),
  pattern: StoredPatternSchema.refine((p) => p.status === 'draft', 'a proposed pattern is a draft'),
});
const StoredLibrarySchema = z.object({
  schema_version: z.literal(1),
  library_version: z.number().int().min(0),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  patterns: z.array(StoredPatternSchema),
});
type StoredPattern = z.infer<typeof StoredPatternSchema>;
type StoredLibrary = z.infer<typeof StoredLibrarySchema>;

type AssertTrue<T extends true> = T;
export type PatternInSync = AssertTrue<Pattern extends StoredPattern ? true : false>;
export type LibraryInSync = AssertTrue<PatternLibrary extends StoredLibrary ? true : false>;

export interface DecisionWrites {
  readonly proposal: Record<string, string> | null;
  readonly library: StoredLibrary | null;
}

const refuse = (message: string): HttpsError => new HttpsError('failed-precondition', message);

/** The live library, or an empty one at version 0; a hand-edited library is refused. */
function libraryOf(raw: unknown): StoredLibrary {
  if (raw === undefined)
    return { schema_version: 1, library_version: 0, content_hash: contentHashOf([]), patterns: [] };
  const lib = StoredLibrarySchema.safeParse(raw);
  if (!lib.success) throw refuse('The pattern library is malformed');
  if (contentHashOf(lib.data.patterns) !== lib.data.content_hash)
    throw refuse('The pattern library does not match its content hash');
  return lib.data;
}

function nextLibrary(lib: StoredLibrary, patterns: StoredPattern[]): StoredLibrary {
  const sorted = [...patterns].sort((a, b) => (a.pattern_id < b.pattern_id ? -1 : 1));
  const next = {
    schema_version: 1 as const,
    library_version: lib.library_version + 1,
    content_hash: contentHashOf(sorted),
    patterns: sorted,
  };
  if (JSON.stringify(next).length > MAX_LIBRARY_CHARS)
    throw refuse('The pattern library is full; retire patterns first');
  return next;
}

function decideProposal(
  input: Exclude<PatternDecision, { decision: 'retire' }>,
  state: { proposal: unknown; library: unknown },
  uid: string,
  now: Date,
): { writes: DecisionWrites; result: PatternDecisionResult } {
  if (state.proposal === undefined) throw new HttpsError('not-found', 'Proposal not found');
  const stored = StoredProposalSchema.safeParse(state.proposal);
  if (!stored.success) throw refuse('Proposal is malformed');
  const { status, expires_at, pattern } = stored.data;
  if (status !== 'proposed') throw refuse(`Cannot ${input.decision} a proposal that is ${status}`);
  const decided = { decided_at: now.toISOString(), decided_by: uid };
  if (input.decision === 'reject')
    return {
      writes: { proposal: { status: 'rejected', ...decided }, library: null },
      result: { status: 'rejected', libraryVersion: null },
    };
  // Past its deadline a proposal may still be rejected, not approved: the miner proposes it again.
  if (Date.parse(expires_at) <= now.getTime()) throw refuse('This proposal has expired');
  const lib = libraryOf(state.library);
  if (lib.patterns.some((p) => p.pattern_id === pattern.pattern_id))
    throw refuse('This pattern is already in the library');
  const live = {
    ...pattern,
    status: 'approved' as const,
    approved_by: uid,
    approved_at: decided.decided_at,
  };
  const library = nextLibrary(lib, [...lib.patterns, live]);
  return {
    writes: { proposal: { status: 'approved', ...decided }, library },
    result: { status: 'approved', libraryVersion: library.library_version },
  };
}

function retire(
  patternId: string,
  rawLibrary: unknown,
  now: Date,
): { writes: DecisionWrites; result: PatternDecisionResult } {
  if (rawLibrary === undefined) throw new HttpsError('not-found', 'Pattern not found');
  const lib = libraryOf(rawLibrary);
  const found = lib.patterns.find((p) => p.pattern_id === patternId);
  if (found === undefined) throw new HttpsError('not-found', 'Pattern not found');
  if (found.status !== 'approved') throw refuse(`Cannot retire a pattern that is ${found.status}`);
  const retired = { ...found, status: 'retired' as const, retired_at: now.toISOString() };
  const library = nextLibrary(
    lib,
    lib.patterns.map((p) => (p.pattern_id === patternId ? retired : p)),
  );
  return {
    writes: { proposal: null, library },
    result: { status: 'retired', libraryVersion: library.library_version },
  };
}

/** Pure: what a decision writes, from the documents as read. Throws an HttpsError when refused. */
export function decide(
  input: PatternDecision,
  state: { proposal: unknown; library: unknown },
  uid: string,
  now: Date,
): { writes: DecisionWrites; result: PatternDecisionResult } {
  return input.decision === 'retire'
    ? retire(input.patternId, state.library, now)
    : decideProposal(input, state, uid, now);
}

export type PatternDecider = (
  input: PatternDecision,
  uid: string,
) => Promise<PatternDecisionResult>;

/** Reads and writes in one transaction, so two decisions can never lose each other's change (B-21). */
export const firestoreDecider =
  (db: Firestore = getFirestore()): PatternDecider =>
  (input, uid) =>
    db.runTransaction(async (tx) => {
      const libRef = db.collection(LIBRARY_COLLECTION).doc(LIBRARY_CURRENT);
      const propRef =
        input.decision === 'retire'
          ? null
          : db.collection(PROPOSALS_COLLECTION).doc(input.proposalId);
      const [prop, lib] = await Promise.all([
        propRef === null ? null : tx.get(propRef),
        tx.get(libRef),
      ]);
      const { writes, result } = decide(
        input,
        {
          proposal: prop?.exists === true ? prop.data() : undefined,
          library: lib.exists ? lib.data() : undefined,
        },
        uid,
        new Date(),
      );
      if (propRef !== null && writes.proposal !== null) tx.update(propRef, writes.proposal);
      if (writes.library !== null) {
        tx.set(libRef, writes.library);
        // `create` fails if this version exists: a copy is never overwritten.
        tx.create(
          db.collection(LIBRARY_COLLECTION).doc(`v${writes.library.library_version}`),
          writes.library,
        );
      }
      return result;
    });
