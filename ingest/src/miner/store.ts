import {
  PATTERN_LIBRARY_COLLECTION,
  PATTERN_LIBRARY_CURRENT,
  PATTERN_PROPOSALS_COLLECTION,
  PatternProposalSchema,
  isRefusedLibrary,
  readPatternLibrary,
  type PatternProposal,
} from '@finrakshak-ai/shared';
import type { DocumentReference, Firestore, Timestamp } from '@google-cloud/firestore';
import { dataKey } from '../config.js';
import { log } from '../log.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJson } from '../store/jsonl.js';
import { sha256Hex } from './hash.js';

/**
 * The miner's only writes (PATTERN_MINER_PLAN.md, "Cost and safety"): its own proposals. It reads the
 * live library to avoid proposing a pattern twice, and never writes it (B-61): only the
 * `decidePattern` callable does.
 */
export interface PatternProposalStore {
  /** Pattern ids with a proposal still waiting; marks proposals past their deadline `expired`. */
  openPatternIds(now: Date): Promise<Set<string>>;
  /** Pattern ids in the live library (approved and retired). */
  livePatternIds(): Promise<Set<string>>;
  /** Which of these proposal ids exist already, whatever their status (a decided one included). */
  existing(ids: readonly string[]): Promise<Set<string>>;
  /** Creates a proposal unless its id exists; returns true when it was new. */
  create(proposal: PatternProposal): Promise<boolean>;
}

const isExpired = (p: PatternProposal, now: Date): boolean =>
  p.status === 'proposed' && Date.parse(p.expires_at) <= now.getTime();

/** gRPC ALREADY_EXISTS: the proposal was created by an earlier attempt of this run. */
const ALREADY_EXISTS = 6;
/** gRPC FAILED_PRECONDITION: the document changed after it was read. */
const FAILED_PRECONDITION = 9;
const isAlreadyExists = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === ALREADY_EXISTS;

export class FirestorePatternProposalStore implements PatternProposalStore {
  constructor(private readonly db: Firestore) {}

  async openPatternIds(now: Date): Promise<Set<string>> {
    const snap = await this.db
      .collection(PATTERN_PROPOSALS_COLLECTION)
      .where('status', '==', 'proposed')
      .limit(200)
      .get();
    const open = new Set<string>();
    for (const d of snap.docs) {
      // Parse, don't cast: a malformed document is skipped, never acted on.
      const p = PatternProposalSchema.safeParse(d.data());
      if (!p.success) continue;
      if (isExpired(p.data, now)) await this.expire(d.ref, d.updateTime);
      else open.add(p.data.pattern.pattern_id);
    }
    return open;
  }

  /** B-21: only if nobody decided it since it was read (the owner's decision always wins). */
  private async expire(ref: DocumentReference, read: Timestamp): Promise<void> {
    try {
      await ref.update({ status: 'expired' }, { lastUpdateTime: read });
    } catch (e) {
      if (!(e instanceof Error && 'code' in e && e.code === FAILED_PRECONDITION)) throw e;
    }
  }

  async livePatternIds(): Promise<Set<string>> {
    const snap = await this.db
      .collection(PATTERN_LIBRARY_COLLECTION)
      .doc(PATTERN_LIBRARY_CURRENT)
      .get();
    if (!snap.exists) return new Set();
    const lib = readPatternLibrary(snap.data(), sha256Hex);
    if (isRefusedLibrary(lib)) {
      // A broken library hides nothing: every candidate may still be proposed for a person to judge.
      log.warn('pattern library refused while checking for duplicates', { reason: lib.refused });
      return new Set();
    }
    return new Set(lib.patterns.map((p) => p.pattern_id));
  }

  async existing(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const col = this.db.collection(PATTERN_PROPOSALS_COLLECTION);
    const snaps = await this.db.getAll(...ids.map((id) => col.doc(id)));
    return new Set(snaps.filter((d) => d.exists).map((d) => d.id));
  }

  async create(proposal: PatternProposal): Promise<boolean> {
    try {
      await this.db
        .collection(PATTERN_PROPOSALS_COLLECTION)
        .doc(proposal.proposal_id)
        .create(PatternProposalSchema.parse(proposal));
      return true;
    } catch (e) {
      if (isAlreadyExists(e)) return false;
      throw e;
    }
  }
}

const proposalKey = (id: string): string => dataKey('interim', 'miner', 'proposals', `${id}.json`);

/** Same contract on disk / in the state bucket (local runs and a dry run without Firestore). */
export class BlobPatternProposalStore implements PatternProposalStore {
  async openPatternIds(now: Date): Promise<Set<string>> {
    const open = new Set<string>();
    for (const info of await blobs().list(dataKey('interim', 'miner', 'proposals'))) {
      const p = await readJson(info.key, PatternProposalSchema);
      if (p?.status !== 'proposed') continue;
      if (isExpired(p, now)) await writeJson(info.key, { ...p, status: 'expired' });
      else open.add(p.pattern.pattern_id);
    }
    return open;
  }

  livePatternIds(): Promise<Set<string>> {
    return Promise.resolve(new Set());
  }

  async existing(ids: readonly string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (const id of ids) if (await blobs().stat(proposalKey(id))) found.add(id);
    return found;
  }

  async create(proposal: PatternProposal): Promise<boolean> {
    if (await blobs().stat(proposalKey(proposal.proposal_id))) return false;
    await writeJson(proposalKey(proposal.proposal_id), PatternProposalSchema.parse(proposal));
    return true;
  }
}

/** In memory, for tests and the `propose` command (which never writes). */
export class MemoryPatternProposalStore implements PatternProposalStore {
  readonly proposals = new Map<string, PatternProposal>();

  constructor(private readonly live: ReadonlySet<string> = new Set()) {}

  openPatternIds(now: Date): Promise<Set<string>> {
    return Promise.resolve().then(() => {
      const open = new Set<string>();
      for (const p of this.proposals.values()) {
        if (p.status !== 'proposed') continue;
        if (isExpired(p, now)) this.proposals.set(p.proposal_id, { ...p, status: 'expired' });
        else open.add(p.pattern.pattern_id);
      }
      return open;
    });
  }

  livePatternIds(): Promise<Set<string>> {
    return Promise.resolve(new Set(this.live));
  }

  existing(ids: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(ids.filter((id) => this.proposals.has(id))));
  }

  create(proposal: PatternProposal): Promise<boolean> {
    return Promise.resolve().then(() => {
      if (this.proposals.has(proposal.proposal_id)) return false;
      this.proposals.set(proposal.proposal_id, PatternProposalSchema.parse(proposal));
      return true;
    });
  }
}
