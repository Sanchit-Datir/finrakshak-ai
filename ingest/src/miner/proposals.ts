import {
  PATTERN_PROPOSAL_TTL_DAYS,
  PATTERN_SCHEMA_VERSION,
  PatternProposalSchema,
  type PatternProposal,
} from '@finrakshak-ai/shared';
import type { Candidate, MineResult } from './candidates.js';
import { sha256Hex } from './hash.js';
import { templatedWording, type PatternWording } from './wording.js';

/**
 * Turns candidates and their wording into `patternProposals` documents (PATTERN_CONTRACT.md, section 5).
 * The pattern inside is exactly what goes live on approval: its definition and every number are the
 * candidate's, copied by code; only the words may come from the model.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most this many proposals per run (PATTERN_MINER_PLAN.md, step 7). */
export const MAX_PATTERN_PROPOSALS = 5;

/** Deterministic: the same candidate on the same input is one proposal, however often a run retries. */
export const patternProposalId = (patternId: string, inputHash: string): string =>
  `pp_${sha256Hex(`${patternId}|${inputHash}`).slice(0, 24)}`;

export interface ProposalMeta {
  readonly runId: string;
  /** Null when the words are templated. */
  readonly model: string | null;
  readonly promptVersion: string;
  readonly inputHash: string;
  readonly now: Date;
}

export function toPatternProposal(
  c: Candidate,
  wording: PatternWording,
  meta: ProposalMeta,
): PatternProposal {
  const created = meta.now.toISOString();
  return PatternProposalSchema.parse({
    proposal_id: patternProposalId(c.pattern_id, meta.inputHash),
    run_id: meta.runId,
    pattern: {
      schema_version: PATTERN_SCHEMA_VERSION,
      pattern_id: c.pattern_id,
      version: 1,
      name: wording.name,
      description: wording.description,
      benign_explanations: [...wording.benign_explanations],
      origin: 'miner',
      status: 'draft',
      definition: c.definition,
      support: {
        basis: 'mined',
        supporting_case_ids: c.stats.support_case_ids,
        supporting_case_count: c.stats.support_case_ids.length,
        population: c.stats.population,
        median_gap_months: c.stats.gap_months?.median ?? null,
      },
      evidence_statuses: c.evidence_statuses,
      created_at: created,
      approved_by: null,
      approved_at: null,
      retired_at: null,
      supersedes: null,
    },
    candidate: c.stats,
    model: meta.model,
    prompt_version: meta.promptVersion,
    input_hash: meta.inputHash,
    status: 'proposed',
    created_at: created,
    expires_at: new Date(meta.now.getTime() + PATTERN_PROPOSAL_TTL_DAYS * DAY_MS).toISOString(),
    decided_at: null,
    decided_by: null,
  });
}

export interface ProposalPlan {
  readonly proposals: PatternProposal[];
  /** Candidates left out, by reason. */
  readonly skipped: { live: number; open: number; rejected: number; over_cap: number };
}

/**
 * Which candidates become proposals, best first: not already live or waiting, not rejected by the
 * model, at most `maxProposals`. Model words are used where the model wrote valid ones (with its id);
 * every other candidate gets the templated words with `model: null`.
 */
export function planProposals(
  result: MineResult,
  agent: {
    worded: ReadonlyMap<string, PatternWording>;
    rejected: ReadonlyMap<string, string>;
  },
  known: { live: ReadonlySet<string>; open: ReadonlySet<string> },
  meta: ProposalMeta & { readonly maxProposals: number },
): ProposalPlan {
  const skipped = { live: 0, open: 0, rejected: 0, over_cap: 0 };
  const proposals: PatternProposal[] = [];
  for (const c of result.candidates) {
    const id = c.pattern_id;
    if (known.live.has(id)) skipped.live++;
    else if (known.open.has(id)) skipped.open++;
    else if (agent.rejected.has(id)) skipped.rejected++;
    else if (proposals.length >= meta.maxProposals) skipped.over_cap++;
    else {
      const words = agent.worded.get(id);
      proposals.push(
        toPatternProposal(c, words ?? templatedWording(c), {
          ...meta,
          model: words === undefined ? null : meta.model,
        }),
      );
    }
  }
  return { proposals, skipped };
}
