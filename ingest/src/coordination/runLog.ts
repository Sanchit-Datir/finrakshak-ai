import {
  BuildRecordSchema,
  ExtractionRecordSchema,
  IngestRunSchema,
  SourceRunRecordSchema,
  type BuildRecord,
  type ExtractionRecord,
  type IngestRun,
  type SourceId,
  type SourceRunRecord,
} from '@fund-tracker/shared';
import { z } from 'zod';
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { dataKey } from '../config.js';
import { blobs } from '../storage/index.js';
import { readJson, writeJson } from '../store/jsonl.js';

export interface ReviewMark {
  readonly status: NonNullable<IngestRun['review_status']>;
  /** Sources Workflows re-runs within this run (automatic `rerun_source`, B-49). */
  readonly rerunSources: readonly SourceId[];
}

/** Where each step of a run reports its outcome; the agent and the admin page read it back. */
export interface RunLog {
  recordSource(runId: string, record: SourceRunRecord): Promise<void>;
  recordBuild(runId: string, record: BuildRecord): Promise<void>;
  recordReview(runId: string, mark: ReviewMark): Promise<void>;
  recordExtraction(runId: string, record: ExtractionRecord): Promise<void>;
  get(runId: string): Promise<IngestRun | null>;
}

/** A run that has no recorded step yet. */
export const emptyRun = (runId: string): IngestRun => IngestRunSchema.parse({ run_id: runId });

const ReviewMarkSchema = z.object({
  review_status: IngestRunSchema.shape.review_status,
  rerun_sources: IngestRunSchema.shape.rerun_sources,
});

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
    const review = await readJson(dataKey(runPrefix(runId), 'review.json'), ReviewMarkSchema);
    const extraction = await readJson(
      dataKey(runPrefix(runId), 'extraction.json'),
      ExtractionRecordSchema,
    );
    return IngestRunSchema.parse({ run_id: runId, sources, build, extraction, ...(review ?? {}) });
  }

  async recordExtraction(runId: string, record: ExtractionRecord): Promise<void> {
    await writeJson(
      dataKey(runPrefix(runId), 'extraction.json'),
      ExtractionRecordSchema.parse(record),
    );
  }

  async recordReview(runId: string, mark: ReviewMark): Promise<void> {
    await writeJson(dataKey(runPrefix(runId), 'review.json'), {
      review_status: mark.status,
      rerun_sources: [...mark.rerunSources],
    });
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

  async recordExtraction(runId: string, record: ExtractionRecord): Promise<void> {
    await this.doc(runId).set(
      { run_id: runId, extraction: ExtractionRecordSchema.parse(record) },
      { merge: true },
    );
  }

  async recordReview(runId: string, mark: ReviewMark): Promise<void> {
    await this.doc(runId).set(
      { run_id: runId, review_status: mark.status, rerun_sources: [...mark.rerunSources] },
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

  async recordReview(runId: string, mark: ReviewMark): Promise<void> {
    for (const l of this.logs) await l.recordReview(runId, mark);
  }

  async recordExtraction(runId: string, record: ExtractionRecord): Promise<void> {
    for (const l of this.logs) await l.recordExtraction(runId, record);
  }

  get(runId: string): Promise<IngestRun | null> {
    return this.logs[0].get(runId);
  }
}
