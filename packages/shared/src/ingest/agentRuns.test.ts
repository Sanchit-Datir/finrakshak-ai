import { describe, expect, it } from 'vitest';
import { AgentRunSchema, agentRunExpiry, agentRunId, type AgentRun } from './agentRuns.js';

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: 'miner_run_1',
  agent: 'miner',
  run_id: 'run_1',
  trigger: 'manual',
  started_at: '2026-10-17T10:00:00.000Z',
  finished_at: '2026-10-17T10:01:00.000Z',
  status: 'templated',
  model: null,
  prompt_version: 'mine.v1',
  input_hash: 'a'.repeat(64),
  tool_calls: 0,
  input_tokens: 0,
  output_tokens: 0,
  outputs: 0,
  output_ref: null,
  note: null,
  expires_at: '2027-11-21T10:01:00.000Z',
  ...over,
});

describe('AgentRun envelope', () => {
  it('accepts a valid envelope', () => {
    expect(AgentRunSchema.safeParse(run()).success).toBe(true);
  });

  it('rejects an unknown agent, a long note, negative counts and a finish before the start', () => {
    expect(AgentRunSchema.safeParse({ ...run(), agent: 'chatbot' }).success).toBe(false);
    expect(AgentRunSchema.safeParse(run({ note: 'x'.repeat(301) })).success).toBe(false);
    expect(AgentRunSchema.safeParse(run({ tool_calls: -1 })).success).toBe(false);
    expect(AgentRunSchema.safeParse(run({ finished_at: '2026-10-17T09:59:59.000Z' })).success).toBe(
      false,
    );
  });

  it('gives a deterministic, Firestore-safe id and a 400-day expiry', () => {
    expect(agentRunId('explainer', 'run/2026 10:17')).toBe('explainer_run-2026-10-17');
    expect(agentRunId('miner', 'x')).toBe(agentRunId('miner', 'x'));
    expect(agentRunExpiry(new Date('2026-10-17T00:00:00.000Z'))).toBe('2027-11-21T00:00:00.000Z');
  });
});
