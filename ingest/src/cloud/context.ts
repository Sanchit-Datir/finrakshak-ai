import { BigQueryHistory, BlobHistory, type HistorySource } from '../agent/history.js';
import { BlobAgentRunStore, FirestoreAgentRunStore, type AgentRunStore } from '../ai/agentRuns.js';
import { BlobAgentStore, FirestoreAgentStore, type AgentStore } from '../agent/store.js';
import { getConfig } from '../config.js';
import { FileLeaseManager } from '../coordination/fileLease.js';
import { firestore } from '../coordination/firestore.js';
import { FirestoreLeaseManager } from '../coordination/firestoreLease.js';
import type { LeaseManager } from '../coordination/lease.js';
import {
  BlobRunLog,
  CompositeRunLog,
  FirestoreRunLog,
  type RunLog,
} from '../coordination/runLog.js';
import type { CloudEnv } from './env.js';

/** Collaborators of the cloud tasks, chosen from configuration (swap them to extend or test). */
export interface CloudDeps {
  readonly leases: LeaseManager;
  readonly runs: RunLog;
  /** Agent reviews and proposals (the runner reads approved proposals; the agent writes them). */
  readonly agent: AgentStore;
  /** Baselines for the agent: BigQuery `ingest_runs` when configured, else run records. */
  readonly history: HistorySource;
  /** One envelope per agent execution (`agentRuns`, AGENTS_PLAN.md). */
  readonly agentRuns: AgentRunStore;
}

/**
 * - `runner` (acquire, build): may write run records to Firestore and to the state bucket.
 * - `agent`: its service account can only read the buckets, so it records to Firestore only.
 * - `extractor`: may only create new objects in the state bucket, so it records to Firestore only.
 * - `scorer`: may only create load files under `interim/risk-load/` (question Q1), so it records to
 *   Firestore only.
 * - `miner`: reads the published tables and writes only its proposals and run record (B-61).
 * - `explainer`: reads alerts and writes only explanations and its run record (B-62).
 */
export type TaskRole = 'runner' | 'agent' | 'extractor' | 'scorer' | 'miner' | 'explainer';

function historyFor(env: CloudEnv): HistorySource {
  const storage = getConfig().storage;
  if (env.bigquery === null || storage.kind !== 'gcs') return new BlobHistory();
  return new BigQueryHistory(env.bigquery.dataset, env.bigquery.location, storage.projectId);
}

export function makeDeps(env: CloudEnv, role: TaskRole): CloudDeps {
  if (getConfig().storage.kind === 'gcs' && env.coordination !== 'firestore')
    throw new Error(
      'Cloud Storage needs FINRAKSHAK_AI_COORDINATION=firestore (file locks are per machine)',
    );
  const history = historyFor(env);
  if (env.coordination === 'file')
    return {
      leases: new FileLeaseManager(),
      runs: new BlobRunLog(),
      agent: new BlobAgentStore(),
      history,
      agentRuns: new BlobAgentRunStore(),
    };
  const db = firestore();
  const firestoreRuns = new FirestoreRunLog(db);
  return {
    leases: new FirestoreLeaseManager(db, `${env.runId}#${env.taskIndex}`),
    runs:
      role === 'runner' ? new CompositeRunLog([firestoreRuns, new BlobRunLog()]) : firestoreRuns,
    agent: new FirestoreAgentStore(db),
    history,
    agentRuns: new FirestoreAgentRunStore(db),
  };
}
