import {
  BuildRecordSchema,
  IngestRunSchema,
  SourceRunRecordSchema,
  type BuildRecord,
  type IngestRun,
  type SourceRunRecord,
} from '@fund-tracker/shared';
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { dataKey } from '../config.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJson } from '../store/jsonl.js';

/** Where each step of a run reports its outcome; the agent and the admin page read it back. */
export interface RunLog {
  recordSource(runId: string, record: SourceRunRecord): Promise<void>;
  recordBuild(runId: string, record: BuildRecord): Promise<void>;
  get(runId: string): Promise<IngestRun | null>;
}

const runPrefix = (runId: string): string => dataKey('interim', 'runs', runId);

/** One JSON object per step under `interim/runs/<runId>/` (works on disk and in the state bucket). */
export class BlobRunLog implements RunLog {
  async recordSource(runId: string, record: SourceRunRecord): Promise<void> {
    await writeJson(
      dataKey(runPrefix(runId), 'sources', `${record.source_id}.json`),
      SourceRunRecordSchema.parse(record),
    );
  }

  async recordBuild(runId: string, record: BuildRecord): Promise<void> {
    await writeJson(dataKey(runPrefix(runId), 'build.json'), BuildRecordSchema.parse(record));
  }

  async get(runId: string): Promise<IngestRun | null> {
    const keys = (await blobs().list(runPrefix(runId))).map((b) => b.key);
    if (keys.length === 0) return null;
    const sources: Record<string, SourceRunRecord> = {};
    for (const key of keys.filter((k) => k.includes('/sources/'))) {
      const record = await readJson(key, SourceRunRecordSchema);
      if (record) sources[record.source_id] = record;
    }
    const build = await readJson(dataKey(runPrefix(runId), 'build.json'), BuildRecordSchema);
    return IngestRunSchema.parse({ run_id: runId, sources, build });
  }
}

export const RUN_COLLECTION = 'ingestRuns';

/** `ingestRuns/{runId}`: one document per run, each step merging its own field. */
export class FirestoreRunLog implements RunLog {
  constructor(private readonly db: Firestore) {}

  private doc(runId: string): DocumentReference {
    return this.db.collection(RUN_COLLECTION).doc(runId);
  }

  async recordSource(runId: string, record: SourceRunRecord): Promise<void> {
    await this.doc(runId).set(
      { run_id: runId, sources: { [record.source_id]: SourceRunRecordSchema.parse(record) } },
      { merge: true },
    );
  }

  async recordBuild(runId: string, record: BuildRecord): Promise<void> {
    await this.doc(runId).set(
      { run_id: runId, build: BuildRecordSchema.parse(record) },
      { merge: true },
    );
  }

  async get(runId: string): Promise<IngestRun | null> {
    const snap = await this.doc(runId).get();
    if (!snap.exists) return null;
    // Parse, don't cast: Firestore data is untrusted until validated.
    return IngestRunSchema.parse({ ...snap.data(), run_id: runId });
  }
}

/** Writes to every log (the bucket copy is the audit trail); reads from the first. */
export class CompositeRunLog implements RunLog {
  constructor(private readonly logs: readonly [RunLog, ...RunLog[]]) {}

  async recordSource(runId: string, record: SourceRunRecord): Promise<void> {
    for (const l of this.logs) await l.recordSource(runId, record);
  }

  async recordBuild(runId: string, record: BuildRecord): Promise<void> {
    for (const l of this.logs) await l.recordBuild(runId, record);
  }

  get(runId: string): Promise<IngestRun | null> {
    return this.logs[0].get(runId);
  }
}
