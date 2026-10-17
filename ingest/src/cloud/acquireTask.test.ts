import {
  AgentProposalSchema,
  type AgentAction,
  type AgentProposal,
  type SourceId,
  type SourceRunRecord,
} from '@fund-tracker/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobHistory } from '../agent/history.js';
import { toProposal } from '../agent/proposals.js';
import { BlobAgentStore } from '../agent/store.js';
import { dataKey } from '../config.js';
import { LeaseHeldError, type LeaseManager } from '../coordination/lease.js';
import { BlobRunLog } from '../coordination/runLog.js';
import { LayoutChangedError } from '../delta/policy.js';
import { reportKey, type DeltaReport } from '../delta/report.js';
import type * as RunExtractModule from '../extract/runExtract.js';
import { extractAllText } from '../extract/runExtract.js';
import type * as AcquireSourceModule from '../pipeline/acquireSource.js';
import {
  acquireSource,
  diagnosticKey,
  failure,
  listingResult,
  type AcquireOutcome,
} from '../pipeline/acquireSource.js';
import { readJson } from '../store/jsonl.js';
import { RUN_AT } from '../test/fixtures.js';
import { freshFsStore, useTempDataDir } from '../test/tempData.js';
import { runAcquireTask } from './acquireTask.js';
import type { CloudDeps } from './context.js';
import { readCloudEnv, type CloudEnv } from './env.js';
import { MemoryAgentRunStore } from '../ai/agentRuns.js';

// The listing/download pipeline and text extraction are replaced; failure/listingResult stay real.
vi.mock('../pipeline/acquireSource.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AcquireSourceModule>()),
  acquireSource: vi.fn(),
}));
vi.mock('../extract/runExtract.js', async (importOriginal) => ({
  ...(await importOriginal<typeof RunExtractModule>()),
  extractAllText: vi.fn(),
}));

useTempDataDir('fundtrace-acquire-task-');

const RUN_ID = 'run_t';

/** Leases granted in memory; names in `held` behave as held by another run (B-51). */
class FakeLeases implements LeaseManager {
  readonly taken: { name: string; ttlMs: number }[] = [];

  constructor(private readonly held: ReadonlySet<string> = new Set()) {}

  withLease<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    if (this.held.has(name))
      return Promise.reject(new LeaseHeldError(name, 'run_other#0', '2026-10-17T10:00:00.000Z'));
    this.taken.push({ name, ttlMs });
    return fn();
  }
}

const envOf = (over: Partial<CloudEnv> = {}): CloudEnv => ({
  ...readCloudEnv({
    FUNDTRACE_RUN_ID: RUN_ID,
    FUNDTRACE_RUN_AT: RUN_AT,
    FUNDTRACE_SOURCES: 'ibbi,nfra',
  }),
  ...over,
});

const depsOf = (leases: LeaseManager = new FakeLeases()): CloudDeps => ({
  leases,
  runs: new BlobRunLog(),
  agent: new BlobAgentStore(),
  history: new BlobHistory(),
  agentRuns: new MemoryAgentRunStore(),
});

function okOutcome(id: SourceId, added: readonly string[] = ['n1']): AcquireOutcome {
  const report: DeltaReport = {
    source_id: id,
    run_at: RUN_AT,
    mode: 'incremental',
    complete: false,
    fetched: added.length,
    total_after: 10,
    unchanged: 0,
    added: [...added],
    changed: [],
    removed: [],
  };
  return { result: listingResult(id, report), report };
}

/** A proposal already in the store, as the owner (or the agent) left it. */
function proposal(
  source: SourceId | null,
  action: AgentAction,
  status: AgentProposal['status'],
  runId = 'run_prev',
): AgentProposal {
  const draft = { source_id: source, action, reason: 'TEST proposal.', auto: false };
  const base = toProposal(runId, draft, new Date(RUN_AT));
  return status === 'proposed'
    ? base
    : {
        ...base,
        status,
        decided_at: RUN_AT,
        decided_by: status === 'approved' ? 'owner' : 'agent',
      };
}

async function seed(deps: CloudDeps, proposals: readonly AgentProposal[]): Promise<void> {
  for (const p of proposals) await deps.agent.createProposal(p);
}

const statusOf = async (p: AgentProposal): Promise<AgentProposal | null> =>
  readJson(dataKey('interim', 'agent', 'proposals', `${p.id}.json`), AgentProposalSchema);

async function recorded(id: SourceId): Promise<SourceRunRecord | undefined> {
  return (await new BlobRunLog().get(RUN_ID))?.sources[id];
}

beforeEach(() => {
  freshFsStore();
  vi.mocked(acquireSource)
    .mockReset()
    .mockImplementation((id) => Promise.resolve(okOutcome(id)));
  vi.mocked(extractAllText).mockReset().mockResolvedValue({ done: 2, failed: 1 });
});

describe('runAcquireTask: recording each source', () => {
  it('records an ok source with its delta, report key, text counts and the run timestamp', async () => {
    const leases = new FakeLeases();
    const env = envOf();
    expect(await runAcquireTask(env, depsOf(leases))).toBe(true);
    expect(await recorded('ibbi')).toMatchObject({
      status: 'ok',
      mode: 'incremental',
      added: 1,
      run_at: RUN_AT,
      texts_extracted: 2,
      texts_failed: 1,
      report_key: reportKey('ibbi', RUN_AT),
      diagnostic_key: null,
      error: null,
    });
    expect(vi.mocked(acquireSource)).toHaveBeenCalledWith('ibbi', {
      runAt: RUN_AT,
      forceFull: false,
      allowShrink: false,
    });
    // One lease per source, for the task's TTL (B-51).
    expect(leases.taken).toEqual([
      { name: 'acquire-ibbi', ttlMs: env.leaseTtlMs },
      { name: 'acquire-nfra', ttlMs: env.leaseTtlMs },
    ]);
  });

  it('runs only the sources assigned to its task index (round-robin)', async () => {
    const env = envOf({ sources: ['ibbi', 'nfra', 'sfio'], taskIndex: 1, taskCount: 2 });
    await runAcquireTask(env, depsOf());
    expect(vi.mocked(acquireSource).mock.calls.map(([id]) => id)).toEqual(['nfra']);
    expect(Object.keys((await new BlobRunLog().get(RUN_ID))?.sources ?? {})).toEqual(['nfra']);
  });

  it('records a failed source without throwing, and the other sources still run (B-47)', async () => {
    vi.mocked(acquireSource).mockImplementation((id) =>
      id === 'ibbi'
        ? Promise.reject(new Error('could not open the raw manifest'))
        : Promise.resolve(okOutcome(id)),
    );
    expect(await runAcquireTask(envOf(), depsOf())).toBe(false);
    expect(await recorded('ibbi')).toMatchObject({
      status: 'failed',
      mode: null,
      added: 0,
      error: 'setup: could not open the raw manifest',
      report_key: null,
      texts_extracted: 0,
    });
    expect((await recorded('nfra'))?.status).toBe('ok');
    expect(vi.mocked(extractAllText).mock.calls).toEqual([[['nfra']]]);
  });

  it('records a failed step reported by the pipeline and caps the error at 500 characters (B-25)', async () => {
    vi.mocked(acquireSource).mockImplementation((id) => {
      const listed = okOutcome(id);
      return Promise.resolve({
        ...listed,
        result: failure(listed.result, 'downloads', new Error(`x${'y'.repeat(700)}`)),
      });
    });
    expect(await runAcquireTask(envOf({ sources: ['ibbi'] }), depsOf())).toBe(false);
    const record = await recorded('ibbi');
    expect(record?.status).toBe('failed');
    expect(record?.added).toBe(1);
    expect(record?.error?.startsWith('downloads: xyy')).toBe(true);
    expect(record?.error).toHaveLength(500);
    // No text extraction for a failed source.
    expect(vi.mocked(extractAllText)).not.toHaveBeenCalled();
  });

  it('records the saved page key when the layout changed (diagnostic_key)', async () => {
    const key = diagnosticKey('nfra', RUN_AT);
    vi.mocked(acquireSource).mockImplementation((id) => {
      if (id !== 'nfra') return Promise.resolve(okOutcome(id));
      const url = 'https://nfra.gov.in/document-category/orders/';
      const e = new LayoutChangedError(`No rows parsed from ${url}`, url, '<html>new</html>');
      return Promise.resolve({
        result: failure(listingResult(id, null), 'listing', e),
        report: null,
        diagnosticKey: key,
      });
    });
    expect(await runAcquireTask(envOf(), depsOf())).toBe(false);
    expect(key).toBe('interim/diagnostics/2026-10-17T03-05-00-000Z/nfra.html');
    expect(await recorded('nfra')).toMatchObject({
      status: 'failed',
      error: 'listing: No rows parsed from https://nfra.gov.in/document-category/orders/',
      diagnostic_key: key,
      report_key: null,
    });
    expect((await recorded('ibbi'))?.diagnostic_key).toBeNull();
  });
});

describe('runAcquireTask: skips and leases', () => {
  it('skips a source flagged skip by Workflows without taking its lease', async () => {
    const leases = new FakeLeases();
    const env = envOf({ sourceFlags: { ibbi: { skip: true } } });
    expect(await runAcquireTask(env, depsOf(leases))).toBe(true);
    expect(await recorded('ibbi')).toMatchObject({
      status: 'skipped',
      mode: null,
      added: 0,
      error: null,
      report_key: null,
    });
    expect(vi.mocked(acquireSource).mock.calls.map(([id]) => id)).toEqual(['nfra']);
    expect(leases.taken.map((l) => l.name)).toEqual(['acquire-nfra']);
  });

  it('skips a source the owner paused, and the pause stays in force', async () => {
    const deps = depsOf();
    const pause = proposal('ibbi', 'pause_source', 'approved');
    await seed(deps, [pause]);
    await runAcquireTask(envOf(), deps);
    expect((await recorded('ibbi'))?.status).toBe('skipped');
    expect((await statusOf(pause))?.status).toBe('approved');
  });

  it('records a lease held by another run as `lease: …` and does not run the source (B-51)', async () => {
    const deps = depsOf(new FakeLeases(new Set(['acquire-ibbi'])));
    const relist = proposal('ibbi', 'full_relist', 'approved');
    await seed(deps, [relist]);
    expect(await runAcquireTask(envOf(), deps)).toBe(false);
    const record = await recorded('ibbi');
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(
      'lease: Lease acquire-ibbi is held by run_other#0 until 2026-10-17T10:00:00.000Z',
    );
    expect(vi.mocked(acquireSource).mock.calls.map(([id]) => id)).toEqual(['nfra']);
    // Not consumed: the relist is still pending for the next run that gets the lease.
    expect((await statusOf(relist))?.status).toBe('approved');
  });
});

describe('runAcquireTask: approved proposals', () => {
  it('applies approved full_relist / accept_shrink as one-run flags and marks them applied', async () => {
    const deps = depsOf();
    const relist = proposal('ibbi', 'full_relist', 'approved');
    const shrink = proposal('nfra', 'accept_shrink', 'approved');
    const waiting = proposal('nfra', 'full_relist', 'proposed');
    await seed(deps, [relist, shrink, waiting]);
    expect(await runAcquireTask(envOf(), deps)).toBe(true);
    expect(vi.mocked(acquireSource).mock.calls).toEqual([
      ['ibbi', { runAt: RUN_AT, forceFull: true, allowShrink: false }],
      ['nfra', { runAt: RUN_AT, forceFull: false, allowShrink: true }],
    ]);
    expect(await statusOf(relist)).toMatchObject({ status: 'applied', applied_run_id: RUN_ID });
    expect(await statusOf(shrink)).toMatchObject({ status: 'applied', applied_run_id: RUN_ID });
    // A proposal the owner has not approved changes nothing and stays open.
    expect(await statusOf(waiting)).toMatchObject({ status: 'proposed', applied_run_id: null });
  });

  it('keeps an approved proposal for the next run when its source fails', async () => {
    vi.mocked(acquireSource).mockImplementation((id) =>
      Promise.resolve({
        result: failure(listingResult(id, null), 'listing', new Error('shrank from 30 to 10')),
        report: null,
      }),
    );
    const deps = depsOf();
    const shrink = proposal('nfra', 'accept_shrink', 'approved');
    await seed(deps, [shrink]);
    expect(await runAcquireTask(envOf({ sources: ['nfra'] }), deps)).toBe(false);
    expect(await statusOf(shrink)).toMatchObject({ status: 'approved', applied_run_id: null });
  });

  it('consumes the automatic re-run of this run once the source succeeds (B-49)', async () => {
    const deps = depsOf();
    const rerun = proposal('ibbi', 'rerun_source', 'auto_approved', RUN_ID);
    await seed(deps, [rerun]);
    await runAcquireTask(envOf({ sources: ['ibbi'] }), deps);
    // A re-run is not a flag: the source simply runs again with the normal options.
    expect(vi.mocked(acquireSource)).toHaveBeenCalledWith('ibbi', {
      runAt: RUN_AT,
      forceFull: false,
      allowShrink: false,
    });
    expect(await statusOf(rerun)).toMatchObject({ status: 'applied', applied_run_id: RUN_ID });
  });

  it('lets flags from Workflows take precedence over approved proposals', async () => {
    const deps = depsOf();
    const shrink = proposal('nfra', 'accept_shrink', 'approved');
    await seed(deps, [shrink]);
    await runAcquireTask(envOf({ sourceFlags: { nfra: { skip: true } } }), deps);
    expect((await recorded('nfra'))?.status).toBe('skipped');
    expect((await statusOf(shrink))?.status).toBe('approved');
  });
});
