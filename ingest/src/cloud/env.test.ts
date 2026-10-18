import { describe, expect, it } from 'vitest';
import { readCloudEnv, sourcesForTask } from './env.js';

describe('readCloudEnv', () => {
  it('defaults to a dry run on one task with file coordination', () => {
    const env = readCloudEnv({ FINRAKSHAK_AI_RUN_AT: '2026-10-17T03:05:00.000Z' });
    expect(env).toMatchObject({
      runId: 'run_2026-10-17T03-05-00-000Z',
      taskIndex: 0,
      taskCount: 1,
      coordination: 'file',
      publishEnabled: false,
      forceBuild: false,
      publishKeep: 14,
      gateMaxDrop: 0.2,
      bigquery: null,
      agentPass: 1,
    });
    expect(env.sources).toEqual(['nfra', 'sfio', 'ed', 'sebi', 'ibbi', 'rbi']);
  });

  it('prefers the Workflows run id, then the Cloud Run execution', () => {
    expect(
      readCloudEnv({ FINRAKSHAK_AI_RUN_ID: 'run_x', CLOUD_RUN_EXECUTION: 'exec-1' }).runId,
    ).toBe('run_x');
    expect(readCloudEnv({ CLOUD_RUN_EXECUTION: 'exec-1' }).runId).toBe('exec-1');
  });

  it('sends a dry run to the _dryrun dataset and a live run to the real one', () => {
    expect(
      readCloudEnv({ FINRAKSHAK_AI_BIGQUERY_DATASET: 'fundtrace_public' }).bigquery?.dataset,
    ).toBe('fundtrace_public_dryrun');
    const live = readCloudEnv({
      FINRAKSHAK_AI_BIGQUERY_DATASET: 'fundtrace_public',
      FINRAKSHAK_AI_PUBLISH_ENABLED: 'true',
    });
    expect(live.bigquery).toEqual({ dataset: 'fundtrace_public', location: 'asia-south1' });
  });

  it('parses per-source flags and rejects malformed or unknown ones', () => {
    expect(
      readCloudEnv({ FINRAKSHAK_AI_SOURCE_FLAGS: '{"nfra":{"forceFull":true}}' }).sourceFlags,
    ).toEqual({ nfra: { forceFull: true } });
    expect(() => readCloudEnv({ FINRAKSHAK_AI_SOURCE_FLAGS: '{not json' })).toThrow(
      /not valid JSON/,
    );
    expect(() => readCloudEnv({ FINRAKSHAK_AI_SOURCE_FLAGS: '{"nope":{}}' })).toThrow();
    expect(() => readCloudEnv({ FINRAKSHAK_AI_SOURCES: 'nfra,unknown' })).toThrow();
  });

  it('rejects unsafe run ids and out-of-range limits', () => {
    expect(() => readCloudEnv({ FINRAKSHAK_AI_RUN_ID: '../etc' })).toThrow();
    expect(() => readCloudEnv({ FINRAKSHAK_AI_LEASE_TTL_MINUTES: '1' })).toThrow();
    expect(() => readCloudEnv({ FINRAKSHAK_AI_GATE_MAX_DROP: '1.5' })).toThrow();
    expect(() => readCloudEnv({ FINRAKSHAK_AI_AGENT_PASS: '3' })).toThrow();
  });
});

describe('sourcesForTask', () => {
  const six = ['nfra', 'sfio', 'ed', 'sebi', 'ibbi', 'rbi'] as const;
  it('gives one source per task when counts match, and round-robins otherwise', () => {
    expect(sourcesForTask(six, 4, 6)).toEqual(['ibbi']);
    expect(sourcesForTask(six, 0, 4)).toEqual(['nfra', 'ibbi']);
    expect(sourcesForTask(six, 3, 4)).toEqual(['sebi']);
    expect(sourcesForTask(six, 5, 1)).toEqual([]);
    expect(sourcesForTask(['ibbi'], 0, 1)).toEqual(['ibbi']);
  });
});

describe('score step settings (W2d)', () => {
  it('is off by default and reads the synthetic dataset, never a dry-run suffix', () => {
    const env = readCloudEnv({ FINRAKSHAK_AI_BIGQUERY_DATASET: 'fundtrace_public' });
    expect(env.score).toEqual({ enabled: false, dataset: 'fundtrace_synth', settings: 'v2' });
    expect(env.bigquery?.dataset).toBe('fundtrace_public_dryrun');
  });

  it('refuses a dataset that is not synthetic and a malformed settings version (B-54)', () => {
    expect(() => readCloudEnv({ FINRAKSHAK_AI_SYNTH_DATASET: 'fundtrace_public' })).toThrow();
    expect(() => readCloudEnv({ FINRAKSHAK_AI_SCORE_SETTINGS: 'latest' })).toThrow();
    expect(readCloudEnv({ FINRAKSHAK_AI_SCORE_ENABLED: 'true' }).score.enabled).toBe(true);
  });
});
