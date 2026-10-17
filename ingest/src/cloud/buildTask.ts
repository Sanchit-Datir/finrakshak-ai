import type { BuildRecord, IngestRun, PublishChannel } from '@fund-tracker/shared';
import { getConfig } from '../config.js';
import { buildDataset, TABLE_NAMES, tableBigQuerySchema, tableKey } from '../dataset/build.js';
import { errorMessage, log } from '../log.js';
import { bigQuerySchema } from '../dataset/bigquery.js';
import { AiClaimRowSchema } from '../extract/ai/schema.js';
import { shadowTableKey, writeShadowTable } from '../extract/ai/store.js';
import { ADAPTERS } from '../pipeline/adapters.js';
import { buildGraphOutputs } from '../pipeline/graph.js';
import { blobs, joinKey } from '../storage/index.js';
import { BigQueryLoader } from './bigquery.js';
import { emptyRun } from '../coordination/runLog.js';
import type { CloudDeps } from './context.js';
import type { CloudEnv } from './env.js';
import { allPassed, evaluateGates, seedCasesIn } from './gates.js';
import { loadHistory } from './history.js';
import { mcaChanged } from './mcaState.js';
import { publishVersion, readCurrent, rollbackToPrevious } from './publish.js';
import { markApplied } from '../agent/proposals.js';

interface Decision {
  readonly build: boolean;
  readonly reason: string;
  readonly commitMca: () => Promise<void>;
}

/** Rebuild only when something changed: a source delta, a new MCA upload, or nothing published yet. */
async function decide(run: IngestRun, env: CloudEnv, channel: PublishChannel): Promise<Decision> {
  // On a re-run pass, only sources finished after this run's earlier build count as new changes.
  const builtAt = run.build && run.build.status !== 'failed' ? run.build.finished_at : null;
  const reasons = Object.values(run.sources)
    .filter((s) => builtAt === null || s.finished_at > builtAt)
    .filter((s) => s.added + s.changed + s.removed > 0)
    .map((s) => `${s.source_id}: +${s.added} ~${s.changed} -${s.removed}`);
  const mca = await mcaChanged();
  if (mca.changed) reasons.push('MCA upload changed');
  if ((await readCurrent(channel)).value === null)
    reasons.push(`nothing published on ${channel} yet`);
  if (env.forceBuild) reasons.push('forced');
  return {
    build: reasons.length > 0,
    reason: (reasons.length > 0 ? reasons.join('; ') : 'no source changed').slice(0, 500),
    commitMca: mca.commit,
  };
}

function loaderFor(env: CloudEnv): BigQueryLoader | null {
  const storage = getConfig().storage;
  // Load jobs read objects straight from Cloud Storage, so BigQuery needs the gcs store.
  if (env.bigquery === null || storage.kind !== 'gcs') return null;
  return new BigQueryLoader(env.bigquery.dataset, env.bigquery.location, storage.projectId);
}

async function loadTables(loader: BigQueryLoader, version: string): Promise<void> {
  for (const table of TABLE_NAMES) {
    const uri = blobs().uri(tableKey(table));
    if (uri === null) return;
    await loader.load({
      table,
      uri,
      schema: tableBigQuerySchema(table),
      mode: 'replace',
      jobId: `tables_${table}_${version}`,
    });
  }
  // AI claims stay in their own table until the quality gate passes (B-52).
  const shadow = await writeShadowTable();
  const shadowUri = blobs().uri(shadowTableKey);
  if (shadow.length > 0 && shadowUri !== null)
    await loader.load({
      table: 'evidence_claims_ai_shadow',
      uri: shadowUri,
      schema: bigQuerySchema(AiClaimRowSchema),
      mode: 'replace',
      clusterBy: ['source_id', 'kind'],
      jobId: `tables_ai_shadow_${version}`,
    });
}

type BuildFields = Omit<BuildRecord, 'started_at' | 'finished_at' | 'reason'>;

const EMPTY: BuildFields = {
  status: 'skipped',
  built_at: null,
  version: null,
  rows: {},
  gates: [],
  bigquery: 'skipped',
  error: null,
};

async function buildAndPublish(
  env: CloudEnv,
  channel: PublishChannel,
  decision: Decision,
  loader: BigQueryLoader | null,
): Promise<BuildFields> {
  const stats = await buildDataset([...ADAPTERS.values()]);
  const graph = await buildGraphOutputs();
  const bundle = await blobs().stat(joinKey(graph.prefix, 'graph-lab.json.gz'));
  const previous = (await readCurrent(channel)).value;
  const gates = evaluateGates({
    stats,
    graph: graph.full,
    bundleBytes: bundle?.size ?? 0,
    previous,
    maxDrop: env.gateMaxDrop,
  });
  const base = { ...EMPTY, built_at: stats.built_at, rows: stats.rows, gates };
  if (!allPassed(gates)) {
    log.warn('publish gates failed; previous version stays live', { channel });
    return { ...base, status: 'gate_failed' };
  }
  const published = await publishVersion({
    channel,
    graph,
    builtAt: stats.built_at,
    runId: env.runId,
    rows: stats.rows,
    seedCases: seedCasesIn(graph.full),
    gates,
    keep: env.publishKeep,
  });
  await decision.commitMca();
  const status = channel === 'live' ? 'published' : 'dry_run';
  if (!loader) return { ...base, status, version: published.version };
  try {
    await loadTables(loader, published.version);
    return { ...base, status, version: published.version, bigquery: 'loaded' };
  } catch (e) {
    return {
      ...base,
      status,
      version: published.version,
      bigquery: 'failed',
      error: `bigquery: ${errorMessage(e)}`,
    };
  }
}

async function history(
  loader: BigQueryLoader | null,
  run: IngestRun,
  record: BuildRecord,
): Promise<BuildRecord> {
  if (!loader) return record;
  try {
    await loadHistory(loader, run, record);
    return record;
  } catch (e) {
    return { ...record, bigquery: 'failed', error: `history: ${errorMessage(e)}`.slice(0, 500) };
  }
}

/**
 * Cloud Run task (one per run): rebuilds the dataset and graph when anything changed, runs the
 * publish gates, publishes a new version, loads BigQuery and records the outcome. A failed gate
 * or step leaves the previously published version live. Returns false when the run needs attention.
 */
/**
 * An owner-approved `rollback_publish` replaces this run's build: the channel goes back one
 * version and nothing new is published until the next run.
 */
async function rollbackIfApproved(
  env: CloudEnv,
  deps: CloudDeps,
  channel: PublishChannel,
): Promise<BuildFields | null> {
  const approved = (await deps.agent.openProposals()).filter(
    (p) => p.action === 'rollback_publish' && p.status === 'approved',
  );
  if (approved.length === 0) return null;
  const restored = await rollbackToPrevious(channel);
  await markApplied(deps.agent, approved, env.runId);
  return {
    ...EMPTY,
    status: restored ? 'published' : 'failed',
    version: restored,
    error: restored ? null : 'rollback approved but no earlier version is available',
  };
}

export async function runBuildTask(env: CloudEnv, deps: CloudDeps): Promise<boolean> {
  const startedAt = new Date().toISOString();
  const run = (await deps.runs.get(env.runId)) ?? emptyRun(env.runId);
  const channel: PublishChannel = env.publishEnabled ? 'live' : 'dry-run';
  const loader = loaderFor(env);
  const rollback = await rollbackIfApproved(env, deps, channel);
  if (rollback) {
    const record = {
      ...rollback,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      reason: 'owner-approved rollback',
    };
    await deps.runs.recordBuild(env.runId, record);
    return rollback.status !== 'failed';
  }
  const decision = await decide(run, env, channel);
  log.info('build decision', {
    run: env.runId,
    channel,
    build: decision.build,
    reason: decision.reason,
  });
  let fields: BuildFields = EMPTY;
  if (decision.build) {
    try {
      fields = await deps.leases.withLease('build', env.leaseTtlMs, () =>
        buildAndPublish(env, channel, decision, loader),
      );
    } catch (e) {
      fields = { ...EMPTY, status: 'failed', error: errorMessage(e).slice(0, 500) };
    }
  }
  const record = await history(loader, run, {
    ...fields,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    reason: decision.reason,
  });
  await deps.runs.recordBuild(env.runId, record);
  log.info('build recorded', {
    run: env.runId,
    status: record.status,
    version: record.version,
    bigquery: record.bigquery,
  });
  return (
    record.status !== 'failed' && record.status !== 'gate_failed' && record.bigquery !== 'failed'
  );
}
