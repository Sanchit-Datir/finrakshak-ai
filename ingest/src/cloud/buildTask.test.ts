import {
  AgentProposalSchema,
  type AgentProposal,
  type BuildRecord,
  type GraphLabBundle,
  type SourceRunRecord,
} from '@fund-tracker/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobHistory } from '../agent/history.js';
import { toProposal } from '../agent/proposals.js';
import { BlobAgentStore } from '../agent/store.js';
import { dataKey } from '../config.js';
import { FileLeaseManager } from '../coordination/fileLease.js';
import { LeaseHeldError, type LeaseManager } from '../coordination/lease.js';
import { BlobRunLog } from '../coordination/runLog.js';
import type * as BuildModule from '../dataset/build.js';
import { buildDataset } from '../dataset/build.js';
import { stamp } from '../delta/report.js';
import type * as GraphModule from '../pipeline/graph.js';
import { buildGraphOutputs } from '../pipeline/graph.js';
import { blobs } from '../storage/index.js';
import { readJson } from '../store/jsonl.js';
import { RUN_AT, sourceRecord } from '../test/fixtures.js';
import { freshFsStore, useTempDataDir } from '../test/tempData.js';
import { runBuildTask } from './buildTask.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv, type CloudEnv } from './env.js';
import { mcaChanged } from './mcaState.js';
import { readCurrent } from './publish.js';

// The dataset and graph builders read data/processed; they are replaced by canned outputs.
vi.mock('../dataset/build.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BuildModule>()),
  buildDataset: vi.fn(),
}));
vi.mock('../pipeline/graph.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GraphModule>()),
  buildGraphOutputs: vi.fn(),
}));

useTempDataDir('fundtrace-build-task-');

const ROWS = { documents: 100, case_events: 10, entities: 10, relationships: 10 };
const DAY1 = '2026-10-15T03:30:00.000Z';
const DAY2 = '2026-10-16T03:30:00.000Z';
const DAY3 = '2026-10-17T03:30:00.000Z';

const bundle: GraphLabBundle = {
  meta: {
    generated_at: RUN_AT,
    synthetic: false,
    label: 'TEST graph',
    dataset_built_at: null,
    thresholds: {},
    counts: {},
    notes: [],
  },
  nodes: [],
  edges: [],
  documents: [],
  networks: [],
  identity: [],
};

/** The next build produces this dataset (`built_at` decides the version name). */
function nextDataset(builtAt: string, rows: Readonly<Record<string, number>> = ROWS): void {
  vi.mocked(buildDataset).mockResolvedValue({
    built_at: builtAt,
    listed_items: {},
    mca_master: null,
    rows: { ...rows },
  });
}

const envOf = (runId: string, over: Partial<CloudEnv> = {}): CloudEnv => ({
  ...readCloudEnv({ FUNDTRACE_RUN_ID: runId, FUNDTRACE_RUN_AT: RUN_AT }),
  ...over,
});

const depsOf = (leases: LeaseManager = new FileLeaseManager()): CloudDeps => ({
  leases,
  runs: new BlobRunLog(),
  agent: new BlobAgentStore(),
  history: new BlobHistory(),
});

async function runWith(
  runId: string,
  sources: readonly SourceRunRecord[],
  over: Partial<CloudEnv> = {},
  deps: CloudDeps = depsOf(),
): Promise<{ ok: boolean; build: BuildRecord | null }> {
  for (const s of sources) await deps.runs.recordSource(runId, s);
  const ok = await runBuildTask(envOf(runId, over), deps);
  return { ok, build: (await deps.runs.get(runId))?.build ?? null };
}

const changed = (added = 3): SourceRunRecord => sourceRecord({ source_id: 'ibbi', added });
const quiet = (): SourceRunRecord => sourceRecord({ source_id: 'ibbi', added: 0 });
const LIVE = { publishEnabled: true };

const rollback = (status: AgentProposal['status']): AgentProposal => ({
  ...toProposal(
    'run_prev',
    { source_id: null, action: 'rollback_publish', reason: 'TEST rollback.', auto: false },
    new Date(RUN_AT),
  ),
  status,
});
const storedProposal = (p: AgentProposal): Promise<AgentProposal | null> =>
  readJson(dataKey('interim', 'agent', 'proposals', `${p.id}.json`), AgentProposalSchema);

beforeEach(() => {
  freshFsStore();
  vi.mocked(buildDataset).mockReset();
  nextDataset(DAY1);
  vi.mocked(buildGraphOutputs)
    .mockReset()
    .mockImplementation(async () => {
      await blobs().write('graph/graph-lab.json.gz', 'TEST gz bundle');
      return {
        prefix: 'graph',
        index: [{ file: 'graph-lab.json.gz', label: 'TEST', synthetic: false }],
        full: bundle,
      };
    });
});

describe('runBuildTask: channels', () => {
  it('a dry run publishes to the dry-run channel only (B-50)', async () => {
    const { ok, build } = await runWith('run_1', [changed()]);
    expect(ok).toBe(true);
    expect(build).toMatchObject({
      status: 'dry_run',
      version: stamp(DAY1),
      built_at: DAY1,
      rows: ROWS,
      bigquery: 'skipped',
      error: null,
    });
    expect(build?.reason).toBe('ibbi: +3 ~0 -0; nothing published on dry-run yet');
    expect(build?.gates.every((g) => g.passed)).toBe(true);
    expect((await readCurrent('dry-run')).value?.version).toBe(stamp(DAY1));
    expect((await readCurrent('live')).value).toBeNull();
  });

  it('with publishing enabled it publishes to the live channel only', async () => {
    const { ok, build } = await runWith('run_1', [changed()], LIVE);
    expect(ok).toBe(true);
    expect(build).toMatchObject({ status: 'published', version: stamp(DAY1) });
    expect((await readCurrent('live')).value).toMatchObject({
      version: stamp(DAY1),
      run_id: 'run_1',
    });
    expect((await readCurrent('dry-run')).value).toBeNull();
  });
});

describe('runBuildTask: when to build', () => {
  it('skips when no source changed, the MCA upload is unchanged and a version is live', async () => {
    await runWith('run_1', [changed()]);
    nextDataset(DAY2);
    const { ok, build } = await runWith('run_2', [quiet()]);
    expect(ok).toBe(true);
    expect(build).toMatchObject({
      status: 'skipped',
      reason: 'no source changed',
      version: null,
      gates: [],
    });
    expect(vi.mocked(buildDataset)).toHaveBeenCalledTimes(1);
    expect((await readCurrent('dry-run')).value?.version).toBe(stamp(DAY1));
  });

  it('rebuilds for a new MCA upload, and for a forced build', async () => {
    await runWith('run_1', [changed()]);
    await blobs().write('raw/mca_ogd/part-1.csv', 'TEST,csv');
    nextDataset(DAY2);
    expect((await runWith('run_2', [quiet()])).build).toMatchObject({
      status: 'dry_run',
      reason: 'MCA upload changed',
    });
    nextDataset(DAY3);
    expect((await runWith('run_3', [quiet()], { forceBuild: true })).build?.reason).toBe('forced');
  });

  it('on the re-run pass counts only sources that finished after this run’s first build (B-49)', async () => {
    await runWith('run_0', [changed()]);
    const deps = depsOf();
    // Pass 1 of run_1 built at 03:30 with ibbi's changes; nfra was re-run afterwards.
    const firstPass = (): Promise<void> =>
      deps.runs.recordBuild('run_1', {
        status: 'dry_run',
        started_at: RUN_AT,
        finished_at: '2026-10-17T03:30:00.000Z',
        reason: 'ibbi: +3 ~0 -0',
        built_at: DAY1,
        version: stamp(DAY1),
        rows: ROWS,
        gates: [],
        bigquery: 'skipped',
        error: null,
      });
    const ibbi = sourceRecord({ source_id: 'ibbi', added: 3, finished_at: RUN_AT });
    const rerun = sourceRecord({ source_id: 'nfra', finished_at: '2026-10-17T03:50:00.000Z' });
    await firstPass();
    expect((await runWith('run_1', [ibbi, rerun], {}, deps)).build?.status).toBe('skipped');
    await firstPass();
    nextDataset(DAY2);
    expect((await runWith('run_1', [{ ...rerun, added: 2 }], {}, deps)).build).toMatchObject({
      status: 'dry_run',
      reason: 'nfra: +2 ~0 -0',
    });
  });
});

describe('runBuildTask: failures leave the published version live', () => {
  it('gate_failed publishes nothing and keeps the previous live version (B-50)', async () => {
    await runWith('run_1', [changed()], LIVE);
    await blobs().write('raw/mca_ogd/part-1.csv', 'TEST,csv');
    nextDataset(DAY2, { ...ROWS, documents: 50 });
    const { ok, build } = await runWith('run_2', [changed(5)], LIVE);
    expect(ok).toBe(false);
    expect(build).toMatchObject({ status: 'gate_failed', version: null, built_at: DAY2 });
    expect(build?.gates.filter((g) => !g.passed).map((g) => g.id)).toEqual(['max_row_drop']);
    expect((await readCurrent('live')).value?.version).toBe(stamp(DAY1));
    expect(await blobs().list(`publish/live/versions/${stamp(DAY2)}`)).toEqual([]);
    // The MCA fingerprint is only committed after a publish, so the next run tries again.
    expect((await mcaChanged()).changed).toBe(true);
  });

  it('records a failed build step and publishes nothing', async () => {
    vi.mocked(buildDataset).mockRejectedValue(new Error('Invalid entities row 3'));
    const { ok, build } = await runWith('run_1', [changed()], LIVE);
    expect(ok).toBe(false);
    expect(build).toMatchObject({
      status: 'failed',
      error: 'Invalid entities row 3',
      version: null,
    });
    expect((await readCurrent('live')).value).toBeNull();
  });

  it('records the build as failed when another run holds the build lease (B-51)', async () => {
    const held: LeaseManager = {
      withLease: (name) => Promise.reject(new LeaseHeldError(name, 'run_x#0', DAY3)),
    };
    const { ok, build } = await runWith('run_1', [changed()], LIVE, depsOf(held));
    expect(ok).toBe(false);
    expect(build?.status).toBe('failed');
    expect(build?.error).toBe(`Lease build is held by run_x#0 until ${DAY3}`);
    expect(vi.mocked(buildDataset)).not.toHaveBeenCalled();
  });
});

describe('runBuildTask: owner-approved rollback', () => {
  it('goes back one version instead of building, and marks the proposal applied', async () => {
    await runWith('run_1', [changed()], LIVE);
    nextDataset(DAY2);
    await runWith('run_2', [changed()], LIVE);
    expect((await readCurrent('live')).value?.version).toBe(stamp(DAY2));
    const deps = depsOf();
    const approved = rollback('approved');
    await deps.agent.createProposal(approved);
    const { ok, build } = await runWith('run_3', [changed()], LIVE, deps);
    expect(ok).toBe(true);
    expect(build).toMatchObject({
      status: 'published',
      version: stamp(DAY1),
      reason: 'owner-approved rollback',
      error: null,
    });
    expect((await readCurrent('live')).value?.version).toBe(stamp(DAY1));
    expect(vi.mocked(buildDataset)).toHaveBeenCalledTimes(2);
    expect(await storedProposal(approved)).toMatchObject({
      status: 'applied',
      applied_run_id: 'run_3',
    });
  });

  it('fails when there is nothing to go back to, and still consumes the proposal', async () => {
    await runWith('run_1', [changed()], LIVE);
    const deps = depsOf();
    const approved = rollback('approved');
    await deps.agent.createProposal(approved);
    const { ok, build } = await runWith('run_2', [], LIVE, deps);
    expect(ok).toBe(false);
    expect(build).toMatchObject({
      status: 'failed',
      version: null,
      error: 'rollback approved but no earlier version is available',
    });
    expect((await readCurrent('live')).value?.version).toBe(stamp(DAY1));
    expect((await storedProposal(approved))?.status).toBe('applied');
    // Consumed, so the next run builds normally instead of retrying the rollback forever.
    nextDataset(DAY2);
    expect((await runWith('run_3', [changed()], LIVE, deps)).build?.status).toBe('published');
  });

  it('ignores a rollback the owner has not approved', async () => {
    const deps = depsOf();
    const waiting = rollback('proposed');
    await deps.agent.createProposal(waiting);
    expect((await runWith('run_1', [changed()], LIVE, deps)).build?.status).toBe('published');
    expect((await storedProposal(waiting))?.status).toBe('proposed');
  });
});
