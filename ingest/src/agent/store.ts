import {
  AgentProposalSchema,
  RunReviewSchema,
  type AgentProposal,
  type RunReview,
} from '@fund-tracker/shared';
import type { Firestore } from '@google-cloud/firestore';
import { dataKey } from '../config.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJson } from '../store/jsonl.js';

/** Statuses that still need someone (owner, Workflows or a task) to act. */
export const OPEN_STATUSES: ReadonlySet<AgentProposal['status']> = new Set([
  'proposed',
  'auto_approved',
  'approved',
]);

/** Persistence of the agent's reviews and proposals (Firestore in the cloud, files locally). */
export interface AgentStore {
  saveReview(review: RunReview): Promise<void>;
  /** Proposals that are not finished (`proposed`, `auto_approved`, `approved`). */
  openProposals(): Promise<AgentProposal[]>;
  createProposal(proposal: AgentProposal): Promise<void>;
  /** Replaces a proposal; the caller decides the transition (see `agent/proposals.ts`). */
  updateProposal(proposal: AgentProposal): Promise<void>;
}

export const REVIEW_COLLECTION = 'ingestReviews';
export const PROPOSAL_COLLECTION = 'agentProposals';

export class FirestoreAgentStore implements AgentStore {
  constructor(private readonly db: Firestore) {}

  async saveReview(review: RunReview): Promise<void> {
    await this.db
      .collection(REVIEW_COLLECTION)
      .doc(review.run_id)
      .set(RunReviewSchema.parse(review));
  }

  async openProposals(): Promise<AgentProposal[]> {
    const snap = await this.db
      .collection(PROPOSAL_COLLECTION)
      .where('status', 'in', [...OPEN_STATUSES])
      .limit(200)
      .get();
    // Parse, don't cast: a malformed document is skipped, never acted on.
    return snap.docs.flatMap((d) => {
      const parsed = AgentProposalSchema.safeParse(d.data());
      return parsed.success ? [parsed.data] : [];
    });
  }

  async createProposal(proposal: AgentProposal): Promise<void> {
    // `create` fails if the id exists, so a retried run never duplicates a proposal.
    await this.db
      .collection(PROPOSAL_COLLECTION)
      .doc(proposal.id)
      .create(AgentProposalSchema.parse(proposal));
  }

  async updateProposal(proposal: AgentProposal): Promise<void> {
    await this.db
      .collection(PROPOSAL_COLLECTION)
      .doc(proposal.id)
      .set(AgentProposalSchema.parse(proposal));
  }
}

const proposalKey = (id: string): string => dataKey('interim', 'agent', 'proposals', `${id}.json`);

/** Same contract on disk / in the state bucket (local development and the dry run without Firestore). */
export class BlobAgentStore implements AgentStore {
  async saveReview(review: RunReview): Promise<void> {
    await writeJson(
      dataKey('interim', 'agent', 'reviews', `${review.run_id}.json`),
      RunReviewSchema.parse(review),
    );
  }

  async openProposals(): Promise<AgentProposal[]> {
    const out: AgentProposal[] = [];
    for (const info of await blobs().list(dataKey('interim', 'agent', 'proposals'))) {
      const p = await readJson(info.key, AgentProposalSchema);
      if (p && OPEN_STATUSES.has(p.status)) out.push(p);
    }
    return out;
  }

  async createProposal(proposal: AgentProposal): Promise<void> {
    if (await blobs().stat(proposalKey(proposal.id))) return;
    await writeJson(proposalKey(proposal.id), AgentProposalSchema.parse(proposal));
  }

  async updateProposal(proposal: AgentProposal): Promise<void> {
    await writeJson(proposalKey(proposal.id), AgentProposalSchema.parse(proposal));
  }
}
