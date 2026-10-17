import {
  AgentProposalSchema,
  RunReviewSchema,
  type AgentProposal,
  type RunReview,
  type SourceRunRecord,
} from '@fund-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCall, ToolSession, Usage } from '../ai/toolModel.js';
import type { HistorySource } from '../agent/history.js';
import { RUN_REVIEW_PROMPT_VERSION } from '../agent/prompts/runReview.js';
import { OPEN_STATUSES, type AgentStore } from '../agent/store.js';
import { BlobRunLog } from '../coordination/runLog.js';
import { buildRecord, sourceRecord, RUN_AT } from '../test/fixtures.js';
import { freshFsStore, useTempDataDir } from '../test/tempData.js';
import { runAgentTask } from './agentTask.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv, type CloudEnv } from './env.js';
import { MemoryAgentRunStore } from '../ai/agentRuns.js';

interface GeminiScript {
  starts: number;
  steps: ToolCall[][];
  fail: Error | null;
}

/** Stand-in for the billed model: replays scripted tool calls and counts sessions started. */
const gemini = vi.hoisted((): GeminiScript => ({ starts: 0, steps: [], fail: null }));

vi.mock('../ai/geminiModel.js', () => ({
  GeminiToolModel: class {
    readonly id = 'gemini-test';

    start(): ToolSession {
      gemini.starts++;
      let i = 0;
      return {
        step: (): Promise<ToolCall[]> =>
          gemini.fail ? Promise.reject(gemini.fail) : Promise.resolve(gemini.steps[i++] ?? []),
        usage: (): Usage => ({ inputTokens: 0, outputTokens: 0 }),
      };
    }
  },
}));

useTempDataDir('fundtrace-agent-task-');

const RUN_ID = 'run_t';

/** Same contract as FirestoreAgentStore: `createProposal` fails when the id already exists. */
class FirestoreLikeAgentStore implements AgentStore {
  readonly reviews = new Map<string, RunReview>();
  readonly proposals = new Map<string, AgentProposal>();
  reviewWrites = 0;

  saveReview(review: RunReview): Promise<void> {
    this.reviews.set(review.run_id, RunReviewSchema.parse(review));
    this.reviewWrites++;
    return Promise.resolve();
  }

  openProposals(): Promise<AgentProposal[]> {
    return Promise.resolve([...this.proposals.values()].filter((p) => OPEN_STATUSES.has(p.status)));
  }

  createProposal(proposal: AgentProposal): Promise<void> {
    if (this.proposals.has(proposal.id))
      return Promise.reject(new Error(`6 ALREADY_EXISTS: ${proposal.id}`));
    this.proposals.set(proposal.id, AgentProposalSchema.parse(proposal));
    return Promise.resolve();
  }

  updateProposal(proposal: AgentProposal): Promise<void> {
    this.proposals.set(proposal.id, AgentProposalSchema.parse(proposal));
    return Promise.resolve();
  }
}

const noHistory: HistorySource = { recent: () => Promise.resolve([]) };

function depsOf(
  agent: FirestoreLikeAgentStore,
  agentRuns: MemoryAgentRunStore = new MemoryAgentRunStore(),
): CloudDeps {
  return {
    leases: { withLease: () => Promise.reject(new Error('the agent takes no lease')) },
    runs: new BlobRunLog(),
    agent,
    history: noHistory,
    agentRuns,
  };
}

const envOf = (pass: 1 | 2): CloudEnv =>
  readCloudEnv({
    FUNDTRACE_RUN_ID: RUN_ID,
    FUNDTRACE_RUN_AT: RUN_AT,
    FUNDTRACE_AGENT_PASS: String(pass),
  });

const TRANSIENT: SourceRunRecord = sourceRecord({
  source_id: 'ibbi',
  status: 'failed',
  mode: null,
  error: 'listing: fetch failed',
});
const LAYOUT: SourceRunRecord = sourceRecord({
  source_id: 'nfra',
  status: 'failed',
  mode: null,
  error:
    'listing: No rows parsed from https://nfra.gov.in/orders/ although nfra.orders was listed before',
});

async function recordRun(sources: readonly SourceRunRecord[]): Promise<void> {
  const runs = new BlobRunLog();
  for (const s of sources) await runs.recordSource(RUN_ID, s);
  await runs.recordBuild(RUN_ID, buildRecord());
}

const healthy = (): Promise<void> =>
  recordRun([sourceRecord({ source_id: 'ibbi', added: 2 }), sourceRecord({ source_id: 'nfra' })]);
const failing = (): Promise<void> => recordRun([TRANSIENT, LAYOUT]);

const proposalsOf = (agent: FirestoreLikeAgentStore): [string | null, string, string][] =>
  [...agent.proposals.values()]
    .map((p): [string | null, string, string] => [p.source_id, p.action, p.status])
    .sort((a, b) => `${a[0] ?? ''}${a[1]}`.localeCompare(`${b[0] ?? ''}${b[1]}`));

async function reviewMark(): Promise<{ status: string | null; reruns: string[] }> {
  const run = await new BlobRunLog().get(RUN_ID);
  return { status: run?.review_status ?? null, reruns: run?.rerun_sources ?? [] };
}

const call = (name: string, args: unknown): ToolCall => ({ id: name, name, args });

beforeEach(() => {
  freshFsStore();
  gemini.starts = 0;
  gemini.steps = [];
  gemini.fail = null;
  vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'mock');
  vi.stubEnv('FUNDTRACE_AGENT_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runAgentTask: healthy and failing runs', () => {
  it('a healthy run gets a templated review and never calls the model (cost guard)', async () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
    await healthy();
    const agent = new FirestoreLikeAgentStore();
    expect(await runAgentTask(envOf(1), depsOf(agent))).toBe(true);
    expect(gemini.starts).toBe(0);
    expect(agent.reviews.get(RUN_ID)).toMatchObject({
      status: 'healthy',
      model: null,
      tool_calls: 0,
      proposals_created: 0,
      findings: [],
      prompt_version: RUN_REVIEW_PROMPT_VERSION,
    });
    expect(agent.reviews.get(RUN_ID)?.summary).toContain('ibbi +2 ~0 -0');
    expect(agent.proposals.size).toBe(0);
    expect(await reviewMark()).toEqual({ status: 'healthy', reruns: [] });
  });

  it('a failing run records findings, proposals and the automatic re-run (B-49)', async () => {
    await failing();
    const agent = new FirestoreLikeAgentStore();
    expect(await runAgentTask(envOf(1), depsOf(agent))).toBe(true);
    const review = agent.reviews.get(RUN_ID);
    // The mock provider runs the whole tool loop with the code's own summary (no billed call).
    expect(review).toMatchObject({ status: 'failed', model: null, tool_calls: 1 });
    expect(review?.proposals_created).toBe(2);
    expect(review?.findings.map((f) => [f.source_id, f.code, f.severity])).toEqual([
      ['ibbi', 'source_failed', 'critical'],
      ['nfra', 'source_failed', 'critical'],
    ]);
    expect(review?.summary).toContain('Failed: ibbi, nfra.');
    expect(review?.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(proposalsOf(agent)).toEqual([
      ['ibbi', 'rerun_source', 'auto_approved'],
      ['nfra', 'adapter_fix_needed', 'proposed'],
    ]);
    expect(await reviewMark()).toEqual({ status: 'failed', reruns: ['ibbi'] });
  });

  it('merges the model’s explanation into the code’s proposal and keeps its own proposals', async () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
    gemini.steps = [
      [
        call('propose_action', {
          source_id: 'nfra',
          action: 'adapter_fix_needed',
          reason: 'The orders table moved into a new block.',
        }),
        call('propose_action', {
          source_id: 'ibbi',
          action: 'rerun_source',
          reason: 'Please retry this source again later today.',
        }),
      ],
      [call('submit_review', { summary: 'IBBI is retried once; NFRA needs an adapter check.' })],
    ];
    await failing();
    const agent = new FirestoreLikeAgentStore();
    await runAgentTask(envOf(1), depsOf(agent));
    expect(agent.reviews.get(RUN_ID)).toMatchObject({
      model: 'gemini-test',
      tool_calls: 3,
      summary: 'IBBI is retried once; NFRA needs an adapter check.',
    });
    // Code drafts win: the re-run keeps its automatic approval; the model only adds its reason.
    expect(proposalsOf(agent)).toEqual([
      ['ibbi', 'rerun_source', 'auto_approved'],
      ['nfra', 'adapter_fix_needed', 'proposed'],
    ]);
    const fix = [...agent.proposals.values()].find((p) => p.action === 'adapter_fix_needed');
    expect(fix?.reason).toContain('Agent: The orders table moved into a new block.');
  });

  it('falls back to the templated review when the model is unavailable', async () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
    gemini.fail = new Error('503 Service Unavailable');
    await failing();
    const agent = new FirestoreLikeAgentStore();
    expect(await runAgentTask(envOf(1), depsOf(agent))).toBe(true);
    const summary = agent.reviews.get(RUN_ID)?.summary ?? '';
    expect(summary).toContain('Failed: ibbi, nfra.');
    expect(summary).toContain('(Agent note: model unavailable: 503 Service Unavailable.)');
    expect(proposalsOf(agent)).toHaveLength(2);
  });

  it('the kill switch keeps the model off but code proposals still go through', async () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
    vi.stubEnv('FUNDTRACE_AGENT_ENABLED', 'false');
    await failing();
    const agent = new FirestoreLikeAgentStore();
    await runAgentTask(envOf(1), depsOf(agent));
    expect(gemini.starts).toBe(0);
    expect(agent.reviews.get(RUN_ID)).toMatchObject({ model: null, tool_calls: 0 });
    expect(await reviewMark()).toEqual({ status: 'failed', reruns: ['ibbi'] });
  });
});

describe('runAgentTask: agentRuns envelope (AGENTS_PLAN.md)', () => {
  it('records one templated envelope per run, without prompt or summary text', async () => {
    await failing();
    const runs = new MemoryAgentRunStore();
    await runAgentTask(envOf(1), depsOf(new FirestoreLikeAgentStore(), runs));
    await runAgentTask(envOf(1), depsOf(new FirestoreLikeAgentStore(), runs));
    expect([...runs.runs.keys()]).toEqual([`ingestion_${RUN_ID}`]);
    const env = runs.runs.get(`ingestion_${RUN_ID}`);
    // The mock wrote nothing billed: the review is the code's own text.
    expect(env).toMatchObject({
      agent: 'ingestion',
      trigger: 'daily',
      status: 'templated',
      model: null,
      prompt_version: RUN_REVIEW_PROMPT_VERSION,
      tool_calls: 1,
      output_ref: `ingestReviews/${RUN_ID}`,
    });
    expect(env?.note ?? '').not.toContain('ibbi +');
  });

  it('marks a healthy day as templated with a note', async () => {
    await healthy();
    const runs = new MemoryAgentRunStore();
    await runAgentTask(envOf(1), depsOf(new FirestoreLikeAgentStore(), runs));
    expect(runs.runs.get(`ingestion_${RUN_ID}`)).toMatchObject({
      status: 'templated',
      tool_calls: 0,
      outputs: 1,
      note: 'healthy run: templated review',
    });
  });
});

describe('runAgentTask: re-runs and retries', () => {
  it('pass 2 never asks for another automatic re-run, so there is no retry loop (B-49)', async () => {
    await failing();
    const agent = new FirestoreLikeAgentStore();
    await runAgentTask(envOf(1), depsOf(agent));
    // The re-run consumed the automatic proposal (acquire marks it applied), then failed again.
    for (const p of agent.proposals.values())
      if (p.action === 'rerun_source')
        await agent.updateProposal({ ...p, status: 'applied', applied_run_id: RUN_ID });
    await new BlobRunLog().recordSource(RUN_ID, { ...TRANSIENT, error: 'listing: ETIMEDOUT' });
    expect(await runAgentTask(envOf(2), depsOf(agent))).toBe(true);
    expect(proposalsOf(agent)).toEqual([
      ['ibbi', 'rerun_source', 'applied'],
      ['nfra', 'adapter_fix_needed', 'proposed'],
    ]);
    expect(await reviewMark()).toEqual({ status: 'failed', reruns: [] });
  });

  it('pass 2 still records owner proposals', async () => {
    await failing();
    const agent = new FirestoreLikeAgentStore();
    await runAgentTask(envOf(2), depsOf(agent));
    expect(proposalsOf(agent)).toEqual([['nfra', 'adapter_fix_needed', 'proposed']]);
    expect(await reviewMark()).toEqual({ status: 'failed', reruns: [] });
  });

  it('is idempotent for the same run id: no duplicate proposals and one review (B-24)', async () => {
    await failing();
    const agent = new FirestoreLikeAgentStore();
    await runAgentTask(envOf(1), depsOf(agent));
    const first = new Map(agent.proposals);
    // The store rejects a second create of the same id, so this would throw on a duplicate.
    await expect(runAgentTask(envOf(1), depsOf(agent))).resolves.toBe(true);
    expect(agent.proposals).toEqual(first);
    expect([agent.reviews.size, agent.reviewWrites]).toEqual([1, 2]);
    expect(agent.reviews.get(RUN_ID)?.status).toBe('failed');
  });
});
