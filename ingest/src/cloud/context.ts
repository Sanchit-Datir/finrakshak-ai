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
}

export function makeDeps(env: CloudEnv): CloudDeps {
  if (getConfig().storage.kind === 'gcs' && env.coordination !== 'firestore')
    throw new Error(
      'Cloud Storage needs FUNDTRACE_COORDINATION=firestore (file locks are per machine)',
    );
  if (env.coordination === 'file')
    return { leases: new FileLeaseManager(), runs: new BlobRunLog() };
  const db = firestore();
  return {
    leases: new FirestoreLeaseManager(db, `${env.runId}#${env.taskIndex}`),
    runs: new CompositeRunLog([new FirestoreRunLog(db), new BlobRunLog()]),
  };
}
