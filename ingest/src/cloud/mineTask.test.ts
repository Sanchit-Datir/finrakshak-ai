import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryAgentRunStore } from '../ai/agentRuns.js';
import type { ToolCall, ToolSession, Usage } from '../ai/toolModel.js';
import { MemoryPatternProposalStore } from '../miner/store.js';
import { plantedContext } from '../miner/testing.js';
import type { MinerContext } from '../miner/tools.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv } from './env.js';
import { runMineTask, type MinePorts } from './mineTask.js';

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
        usage: (): Usage => ({ inputTokens: 120, outputTokens: 30 }),
      };
    }
  },
}));

const ctx = plantedContext();
const ID = ctx.result.candidates[0]?.pattern_id ?? '';
const env = readCloudEnv({ FUNDTRACE_RUN_ID: 'mine_1', FUNDTRACE_RUN_AT: '2026-10-17T10:00:00Z' });

function setup(over: Partial<MinePorts> = {}): {
  ports: MinePorts;
  store: MemoryPatternProposalStore;
  runs: MemoryAgentRunStore;
  deps: CloudDeps;
} {
  const store = new MemoryPatternProposalStore();
  const runs = new MemoryAgentRunStore();
  const ports: MinePorts = {
    store,
    load: (): Promise<MinerContext> => Promise.resolve(ctx),
    published: () => Promise.resolve(true),
    ...over,
  };
  return { ports, store, runs, deps: { agentRuns: runs } as unknown as CloudDeps };
}

const envelopeOf = (runs: MemoryAgentRunStore): unknown => runs.runs.get('miner_mine_1');

const MODEL_WORDS: ToolCall[] = [
  {
    id: 'p',
    name: 'propose_pattern',
    args: {
      pattern_id: ID,
      name: 'ED search, then insolvency',
      description: 'An ED search record, then an insolvency record within 6 months, in 4 cases.',
      benign_explanations: ['ED searches often end without any order against the company.'],
    },
  },
  { id: 's', name: 'submit_summary', args: { summary: 'One candidate worded for the owner.' } },
];

beforeEach(() => {
  gemini.starts = 0;
  gemini.steps = [];
  gemini.fail = null;
  vi.stubEnv('FUNDTRACE_MINER_ENABLED', 'true');
  vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runMineTask: switched off or nothing to do', () => {
  it('the kill switch writes no proposal and never calls the model', async () => {
    vi.stubEnv('FUNDTRACE_MINER_ENABLED', 'false');
    const t = setup();
    expect(await runMineTask(env, t.deps, t.ports)).toBe(true);
    expect(t.store.proposals.size).toBe(0);
    expect(gemini.starts).toBe(0);
    expect(envelopeOf(t.runs)).toMatchObject({
      agent: 'miner',
      status: 'skipped',
      trigger: 'manual',
    });
  });

  it('waits for a published build (B-50) and records when the code found nothing', async () => {
    const unpublished = setup({ published: () => Promise.resolve(false) });
    await runMineTask(env, unpublished.deps, unpublished.ports);
    expect(envelopeOf(unpublished.runs)).toMatchObject({
      status: 'skipped',
      note: 'no published build yet (B-50)',
    });
    const nothing = setup({
      load: () => Promise.resolve({ ...ctx, result: { ...ctx.result, candidates: [] } }),
    });
    await runMineTask(env, nothing.deps, nothing.ports);
    expect(envelopeOf(nothing.runs)).toMatchObject({ note: 'the code found no candidates' });
    expect(gemini.starts).toBe(0);
  });
});

describe('runMineTask: proposals', () => {
  it('the mock works the proposals out in full but stores none', async () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'mock');
    const t = setup();
    await runMineTask(env, t.deps, t.ports);
    expect(t.store.proposals.size).toBe(0);
    expect(envelopeOf(t.runs)).toMatchObject({ status: 'templated', model: null, outputs: 0 });
  });

  it('stores the model-worded proposal with its model id, prompt version and numbers', async () => {
    gemini.steps = [MODEL_WORDS];
    const t = setup();
    await runMineTask(env, t.deps, t.ports);
    const [p] = [...t.store.proposals.values()];
    expect(p).toMatchObject({
      model: 'gemini-test',
      prompt_version: 'mine.v1',
      status: 'proposed',
      pattern: { name: 'ED search, then insolvency', support: { supporting_case_count: 4 } },
    });
    expect(envelopeOf(t.runs)).toMatchObject({
      status: 'done',
      outputs: 1,
      input_tokens: 120,
      output_ref: 'patternProposals',
    });
  });

  it('falls back to templated words (model null) when the model fails', async () => {
    gemini.fail = new Error('429 quota');
    const t = setup();
    await runMineTask(env, t.deps, t.ports);
    expect([...t.store.proposals.values()].map((p) => p.model)).toEqual([null]);
    expect(envelopeOf(t.runs)).toMatchObject({ status: 'templated', outputs: 1 });
  });

  it('does not call the model again for the same input, even after the owner decided', async () => {
    gemini.steps = [MODEL_WORDS];
    const t = setup();
    await runMineTask(env, t.deps, t.ports);
    for (const p of t.store.proposals.values())
      t.store.proposals.set(p.proposal_id, { ...p, status: 'rejected' });
    await runMineTask(env, t.deps, t.ports);
    expect(gemini.starts).toBe(1);
    expect(t.store.proposals.size).toBe(1);
    expect(envelopeOf(t.runs)).toMatchObject({
      status: 'skipped',
      note: 'nothing new since the last run (same input)',
    });
  });
});
