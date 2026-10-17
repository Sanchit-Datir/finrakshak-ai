import { z } from 'zod';
import { UtcTimestampSchema } from '../evidence/documents.js';

/**
 * One small record per agent execution (docs/plans/AGENTS_PLAN.md, "What the new agents add"): Firestore
 * `agentRuns/{id}`, written by the jobs only. It holds counts, ids and versions, never a prompt or a
 * model response (CLAUDE.md). Summing the tokens gives a spend estimate to watch against the budget
 * alert (B-15); the share of `templated` runs is a health signal.
 */

export const AGENT_RUNS_COLLECTION = 'agentRuns';
/** Envelopes are removed by a Firestore TTL policy on `expiresAt` after about this long. */
export const AGENT_RUN_TTL_DAYS = 400;

export const AGENT_NAMES = ['ingestion', 'extractor', 'miner', 'explainer'] as const;
export const AgentNameSchema = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const AGENT_RUN_TRIGGERS = ['daily', 'manual'] as const;

/**
 * - `done`: the model's output passed every check and was used.
 * - `templated`: code wrote the result (model off, mock, failed, or its output was rejected).
 * - `skipped`: nothing to do (kill switch, same input as last time, no input).
 * - `failed`: the job itself failed.
 */
export const AGENT_RUN_STATUSES = ['done', 'templated', 'skipped', 'failed'] as const;
export const AgentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

const count = z.number().int().nonnegative();

export const AgentRunSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
    agent: AgentNameSchema,
    /** The pipeline run (daily) or the execution (on demand) this envelope belongs to. */
    run_id: z.string().min(1).max(120),
    trigger: z.enum(AGENT_RUN_TRIGGERS),
    started_at: UtcTimestampSchema,
    finished_at: UtcTimestampSchema,
    status: AgentRunStatusSchema,
    /** Model id, or null when no billed model ran (mock, kill switch, skipped). */
    model: z.string().min(1).nullable(),
    prompt_version: z.string().min(1),
    /** sha256 of the code-computed input (no prompt text is stored). */
    input_hash: z.string().regex(/^[0-9a-f]{64}$/),
    tool_calls: count,
    input_tokens: count,
    output_tokens: count,
    /** How many outputs were written (proposals, explanations, one review). */
    outputs: count,
    /** Where the outputs are, e.g. `ingestReviews/<runId>`; null when nothing was written. */
    output_ref: z.string().min(1).max(200).nullable(),
    /** At most 300 characters; never holds a prompt or a response. */
    note: z.string().max(300).nullable(),
    expires_at: UtcTimestampSchema,
  })
  .refine((r) => r.finished_at >= r.started_at, 'finished_at cannot be before started_at');
export type AgentRun = z.infer<typeof AgentRunSchema>;

/** Deterministic id: a retried step overwrites its own envelope instead of adding another. */
export const agentRunId = (agent: AgentName, runId: string): string =>
  `${agent}_${runId.replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 160);

export const agentRunExpiry = (finishedAt: Date): string =>
  new Date(finishedAt.getTime() + AGENT_RUN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
