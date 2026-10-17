import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RiskLatestDocSchema } from '@fund-tracker/shared';
import type { RowQuery } from '../risk/bigQueryInputs.js';
import { MemoryRiskStore } from '../risk/scoreStore.js';
import { writeSmallDataset } from '../test/synthScoring.js';
import { freshGcsLikeStore, useTempDataDir } from '../test/tempData.js';
import type { LoadSpec } from './bigquery.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv, type CloudEnv } from './env.js';
import { runScoreTask, SCORE_LEASE, type ScorePorts } from './scoreTask.js';

useTempDataDir();
freshGcsLikeStore();
const dir = writeSmallDataset();

const query: RowQuery = {
  rows: (sql) => {
    const table = /`\w+_synth\.(\w+)`/.exec(sql)?.[1] ?? '';
    return Promise.resolve(
      readFileSync(path.join(dir, `${table}.jsonl`), 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l): unknown => JSON.parse(l)),
    );
  },
};

function setup(vars: Record<string, string> = {}): {
  env: CloudEnv;
  deps: CloudDeps;
  ports: ScorePorts & { store: MemoryRiskStore };
  leases: string[];
  loads: LoadSpec[];
} {
  const leases: string[] = [];
  const loads: LoadSpec[] = [];
  const deps = {
    leases: {
      withLease: <T>(name: string, _ttl: number, fn: () => Promise<T>): Promise<T> => {
        leases.push(name);
        return fn();
      },
    },
  } as unknown as CloudDeps;
  const env = readCloudEnv({
    FUNDTRACE_RUN_ID: 'run_1',
    FUNDTRACE_RUN_AT: '2025-12-30T22:00:00.000Z',
    FUNDTRACE_SCORE_ENABLED: 'true',
    ...vars,
  });
  const ports = {
    query,
    loader: { load: (s: LoadSpec) => Promise.resolve(void loads.push(s)) },
    store: new MemoryRiskStore(),
  };
  return { env, deps, ports, leases, loads };
}

describe('runScoreTask (W2d)', () => {
  it('does nothing while the step is off (the default)', async () => {
    const t = setup({ FUNDTRACE_SCORE_ENABLED: 'false' });
    expect(await runScoreTask(t.env, t.deps, t.ports)).toBe(true);
    expect(t.leases).toEqual([]);
    expect(t.ports.store.latest.size).toBe(0);
  });

  it('scores under the lease, for the IST day of the run, and writes BigQuery then Firestore', async () => {
    const t = setup();
    expect(await runScoreTask(t.env, t.deps, t.ports)).toBe(true);
    expect(t.leases).toEqual([SCORE_LEASE]);
    // 22:00 UTC on 30 Dec is 31 Dec in IST (B-27).
    const docs = [...t.ports.store.latest.values()];
    expect(docs.length).toBeGreaterThan(0);
    expect(
      docs.every((d) => d.as_of === '2025-12-31' && RiskLatestDocSchema.safeParse(d).success),
    ).toBe(true);
    expect(t.loads.map((l) => l.table)).toContain('risk_scores');
  });

  it('marks every score stale when no public build is published (B-50, B-56)', async () => {
    const t = setup();
    await runScoreTask(t.env, t.deps, t.ports);
    expect([...t.ports.store.latest.values()].every((d) => d.latest.stale_inputs)).toBe(true);
  });

  it('a retried run of the same day adds no alert and no new load job (B-24)', async () => {
    const t = setup();
    await runScoreTask(t.env, t.deps, t.ports);
    const alerts = t.ports.store.alerts.size;
    const jobs = t.loads.map((l) => l.jobId);
    t.loads.length = 0;
    const retry = setup({ FUNDTRACE_RUN_ID: 'run_2' });
    await runScoreTask(retry.env, t.deps, {
      ...t.ports,
      loader: { load: (s) => Promise.resolve(void t.loads.push(s)) },
    });
    expect(t.ports.store.alerts.size).toBe(alerts);
    expect(t.loads.map((l) => l.jobId)).toEqual(jobs);
  });

  it('refuses a dataset that is not synthetic before it starts (B-54)', () => {
    expect(() => setup({ FUNDTRACE_SYNTH_DATASET: 'fundtrace_public' })).toThrow(/_synth/);
  });
});
