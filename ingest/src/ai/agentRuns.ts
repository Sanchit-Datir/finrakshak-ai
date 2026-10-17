import {
  AGENT_RUNS_COLLECTION,
  AgentRunSchema,
  agentRunExpiry,
  agentRunId,
  type AgentName,
  type AgentRun,
  type AgentRunStatus,
} from '@fund-tracker/shared';
import { Timestamp, type Firestore } from '@google-cloud/firestore';
import { dataKey } from '../config.js';
import { writeJson } from '../store/jsonl.js';
import type { Usage } from './toolModel.js';

/**
 * Where each agent execution records its envelope (`agentRuns/{agent}_{runId}`, AGENTS_PLAN.md). The id
 * is deterministic, so a retried step replaces its own record instead of adding one.
 */
export interface AgentRunStore {
  save(run: AgentRun): Promise<void>;
}

export class FirestoreAgentRunStore implements AgentRunStore {
  constructor(private readonly db: Firestore) {}

  async save(run: AgentRun): Promise<void> {
    const doc = AgentRunSchema.parse(run);
    // `expiresAt` is a Timestamp so the Firestore TTL policy can remove old envelopes.
    await this.db
      .collection(AGENT_RUNS_COLLECTION)
      .doc(doc.id)
      .set({ ...doc, expiresAt: Timestamp.fromDate(new Date(doc.expires_at)) });
  }
}

/** Same contract on disk / in the state bucket (local runs and the dry run without Firestore). */
export class BlobAgentRunStore implements AgentRunStore {
  async save(run: AgentRun): Promise<void> {
    const doc = AgentRunSchema.parse(run);
    await writeJson(dataKey('interim', 'agent', 'runs', `${doc.id}.json`), doc);
  }
}

export class MemoryAgentRunStore implements AgentRunStore {
  readonly runs = new Map<string, AgentRun>();

  save(run: AgentRun): Promise<void> {
    return Promise.resolve().then(() => {
      const doc = AgentRunSchema.parse(run);
      this.runs.set(doc.id, doc);
    });
  }
}

export interface EnvelopeInput {
  readonly agent: AgentName;
  readonly runId: string;
  readonly trigger: AgentRun['trigger'];
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly status: AgentRunStatus;
  readonly model: string | null;
  readonly promptVersion: string;
  readonly inputHash: string;
  readonly toolCalls: number;
  readonly usage: Usage;
  readonly outputs: number;
  readonly outputRef: string | null;
  readonly note: string | null;
}

export function envelope(i: EnvelopeInput): AgentRun {
  return {
    id: agentRunId(i.agent, i.runId),
    agent: i.agent,
    run_id: i.runId,
    trigger: i.trigger,
    started_at: i.startedAt.toISOString(),
    finished_at: i.finishedAt.toISOString(),
    status: i.status,
    model: i.model,
    prompt_version: i.promptVersion,
    input_hash: i.inputHash,
    tool_calls: i.toolCalls,
    input_tokens: i.usage.inputTokens,
    output_tokens: i.usage.outputTokens,
    outputs: i.outputs,
    output_ref: i.outputRef,
    note: i.note === null ? null : i.note.slice(0, 300),
    expires_at: agentRunExpiry(i.finishedAt),
  };
}

export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };
