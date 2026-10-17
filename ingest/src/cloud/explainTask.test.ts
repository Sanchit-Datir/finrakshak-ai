import { RISK_EXPLANATIONS_COLLECTION } from '@fund-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryAgentRunStore } from '../ai/agentRuns.js';
import type { ToolCall, ToolSession, Usage } from '../ai/toolModel.js';
import { EXPLAINER_COLLECTIONS, MemoryExplainStore } from '../explain/store.js';
import { alert } from '../explain/testing.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv } from './env.js';
import { runExplainTask } from './explainTask.js';

interface GeminiScript {
  starts: number;
  text: string;
  fail: Error | null;
}

/** Stand-in for the billed model: answers each alert with `text` for that alert's id. */
const gemini = vi.hoisted((): GeminiScript => ({ starts: 0, text: '', fail: null }));

vi.mock('../ai/geminiModel.js', () => ({
  GeminiToolModel: class {
    readonly id = 'gemini-test';

    start(_system: string, user: string): ToolSession {
      gemini.starts++;
      const alertId = String((JSON.parse(user) as { alert_id?: unknown }).alert_id);
      let done = false;
      return {
        step: (): Promise<ToolCall[]> => {
          if (gemini.fail) return Promise.reject(gemini.fail);
          if (done) return Promise.resolve([]);
          done = true;
          return Promise.resolve([
            { id: 's', name: 'submit_explanation', args: { alert_id: alertId, text: gemini.text } },
          ]);
        },
        usage: (): Usage => ({ inputTokens: 100, outputTokens: 20 }),
      };
    }
  },
}));

const env = readCloudEnv({ FUNDTRACE_RUN_ID: 'run_1', FUNDTRACE_RUN_AT: '2025-09-30T22:00:00Z' });
const GOOD = 'A public record dated 2025-05-26 names {BORROWER} (an allegation, not a finding).';

function setup(alerts = [alert()]): {
  store: MemoryExplainStore;
  runs: MemoryAgentRunStore;
  deps: CloudDeps;
} {
  const runs = new MemoryAgentRunStore();
  return {
    store: new MemoryExplainStore(alerts),
    runs,
    deps: { agentRuns: runs } as unknown as CloudDeps,
  };
}

const envelopeOf = (runs: MemoryAgentRunStore): unknown => runs.runs.get('explainer_run_1');

beforeEach(() => {
  gemini.starts = 0;
  gemini.text = GOOD;
  gemini.fail = null;
  vi.stubEnv('FUNDTRACE_EXPLAIN_ENABLED', 'true');
  vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runExplainTask', () => {
  it('is off by default and never calls the model (B-15)', async () => {
    vi.stubEnv('FUNDTRACE_EXPLAIN_ENABLED', 'false');
    const t = setup();
    expect(await runExplainTask(env, t.deps, { store: t.store })).toBe(true);
    expect(gemini.starts).toBe(0);
    expect(envelopeOf(t.runs)).toMatchObject({ agent: 'explainer', status: 'skipped' });
  });

  it('stores a checked explanation beside the alert, with model and prompt version', async () => {
    const t = setup();
    await runExplainTask(env, t.deps, { store: t.store });
    expect(t.store.explanations.get('L-0005_abc')).toMatchObject({
      loan_id: 'L-0005',
      text: 'A public record dated 2025-05-26 names the borrower (an allegation, not a finding).',
      model: 'gemini-test',
      prompt_version: 'explain.v1',
      synthetic: true,
    });
    expect(envelopeOf(t.runs)).toMatchObject({ status: 'done', outputs: 1, input_tokens: 100 });
  });

  it('a second run writes nothing new (B-24)', async () => {
    const t = setup();
    await runExplainTask(env, t.deps, { store: t.store });
    await runExplainTask(env, t.deps, { store: t.store });
    expect(gemini.starts).toBe(1);
    expect(envelopeOf(t.runs)).toMatchObject({
      status: 'skipped',
      note: 'every alert already has an explanation',
    });
  });

  it('keeps only the template for a rejected sentence or a failing model', async () => {
    gemini.text = 'The borrower is guilty.';
    const rejected = setup();
    await runExplainTask(env, rejected.deps, { store: rejected.store });
    expect(rejected.store.explanations.size).toBe(0);
    gemini.fail = new Error('429');
    const failed = setup();
    await runExplainTask(env, failed.deps, { store: failed.store });
    expect(failed.store.explanations.size).toBe(0);
    expect(envelopeOf(failed.runs)).toMatchObject({ status: 'templated', outputs: 0 });
  });

  it('the mock runs every check but stores nothing', async () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'mock');
    const t = setup();
    await runExplainTask(env, t.deps, { store: t.store });
    expect(t.store.explanations.size).toBe(0);
    expect(envelopeOf(t.runs)).toMatchObject({ status: 'templated', model: null });
  });

  it('caps the alerts per run, most urgent first, and ignores other runs', async () => {
    vi.stubEnv('FUNDTRACE_EXPLAIN_MAX_ALERTS', '1');
    const t = setup([
      alert({ alert_id: 'L-1_a', score: 35 }),
      alert({ alert_id: 'L-2_a', score: 49 }),
      alert({ alert_id: 'L-3_a', run_id: 'run_other', band: 'urgent', score: 80 }),
    ]);
    await runExplainTask(env, t.deps, { store: t.store });
    expect([...t.store.explanations.keys()]).toEqual(['L-2_a']);
    expect(t.runs.runs.get('explainer_run_1')?.note).toContain('1 over the cap');
  });

  it('writes only the explanations collection (B-62)', () => {
    expect(EXPLAINER_COLLECTIONS).toEqual([RISK_EXPLANATIONS_COLLECTION]);
  });
});
