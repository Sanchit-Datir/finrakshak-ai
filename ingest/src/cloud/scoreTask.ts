import {
  SeedVerificationFileSchema,
  istDate,
  matchPattern,
  settingsForVersion,
  type PublishChannel,
} from '@fund-tracker/shared';
import { getConfig } from '../config.js';
import { firestore } from '../coordination/firestore.js';
import { log } from '../log.js';
import { bigQueryScoringInputs, BigQueryRows, type RowQuery } from '../risk/bigQueryInputs.js';
import { scoreDay } from '../risk/daily.js';
import { codePatterns, loadLibrary } from '../risk/patternSources.js';
import { FirestoreRiskStore, type RiskStateStore } from '../risk/scoreStore.js';
import { writeHistory } from '../risk/scoreWriter.js';
import type { TableLoader } from '../risk/synthTables.js';
import { dataKey } from '../config.js';
import { readJson } from '../store/jsonl.js';
import { BigQueryLoader } from './bigquery.js';
import type { CloudDeps } from './context.js';
import type { CloudEnv } from './env.js';
import { readCurrent } from './publish.js';

/**
 * Cloud Run task `score` (REMAINING_WORK.md, W2d; job `ingest-score`): scores every synthetic loan for the
 * run's IST day with the same pure core as `npm run score`, then appends the history to BigQuery and
 * updates Firestore. Off by default (`FUNDTRACE_SCORE_ENABLED`). SYNTH data only (B-54); no model is ever
 * called (B-15); it reads the date of the published, gated build only (B-50); a lease stops two runs
 * writing at once (B-51); a retry of the same day writes nothing new (B-24, B-57).
 */

export const SCORE_LEASE = 'score-synthetic';

/** The scorer's collaborators, chosen from configuration (tests pass fakes). */
export interface ScorePorts {
  readonly query: RowQuery;
  /** Null on disk: the history is staged as files and not loaded. */
  readonly loader: TableLoader | null;
  readonly store: RiskStateStore;
}

export function defaultScorePorts(env: CloudEnv): ScorePorts {
  const storage = getConfig().storage;
  const projectId = storage.kind === 'gcs' ? storage.projectId : undefined;
  const location = env.bigquery?.location ?? 'asia-south1';
  return {
    query: new BigQueryRows(location, projectId),
    loader:
      storage.kind === 'gcs' ? new BigQueryLoader(env.score.dataset, location, projectId) : null,
    store: new FirestoreRiskStore(firestore()),
  };
}

/** IST day of the build the app serves on this run's channel, or null when nothing is published. */
async function publishedBuildDay(env: CloudEnv): Promise<string | null> {
  const channel: PublishChannel = env.publishEnabled ? 'live' : 'dry-run';
  const current = (await readCurrent(channel)).value;
  return current === null ? null : istDate(current.built_at);
}

async function scoreOnce(env: CloudEnv, ports: ScorePorts): Promise<void> {
  const settings = settingsForVersion(env.score.settings);
  if (settings === undefined) throw new Error(`Unknown settings version: ${env.score.settings}`);
  const asOf = istDate(env.runAt);
  const data = await bigQueryScoringInputs({
    query: ports.query,
    dataset: env.score.dataset,
    dataBuiltOn: await publishedBuildDay(env),
    seedReview: await readJson(
      dataKey('verification', 'seed_review.json'),
      SeedVerificationFileSchema,
    ),
  }).load();
  const previous = await ports.store.readLatest();
  const out = scoreDay({
    data,
    asOf,
    runId: env.runId,
    now: new Date().toISOString(),
    settings,
    library: await loadLibrary(codePatterns()),
    matcher: matchPattern,
    previous: previous.docs,
  });
  // History first, then alerts, then the state: a failure part-way is redone identically by the retry.
  const staged = await writeHistory(out, asOf, ports.loader);
  const created = await ports.store.createAlerts(out.alertDocs);
  await ports.store.writeLatest(out.latestDocs);
  log.info('synthetic scores written', {
    run: env.runId,
    asOf,
    loans: out.latestDocs.length,
    alerts: out.alertDocs.length,
    newAlerts: created,
    malformedSkipped: previous.malformed,
    tables: staged.map((s) => `${s.table}:${s.rows}`).join(','),
    findings: out.findings.map((f) => f.code).join(','),
  });
}

export async function runScoreTask(
  env: CloudEnv,
  deps: CloudDeps,
  ports: ScorePorts | null = null,
): Promise<boolean> {
  if (!env.score.enabled) {
    log.info('score step is off (FUNDTRACE_SCORE_ENABLED=false)', { run: env.runId });
    return true;
  }
  await deps.leases.withLease(SCORE_LEASE, env.leaseTtlMs, () =>
    scoreOnce(env, ports ?? defaultScorePorts(env)),
  );
  return true;
}
