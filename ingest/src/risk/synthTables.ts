import { createHash } from 'node:crypto';
import {
  SynthEntitySchema,
  SynthFlagSchema,
  SynthLoanSchema,
  SynthRelationshipSchema,
  SynthTransactionSchema,
} from '@finrakshak-ai/shared';
import type { z } from 'zod';
import type { LoadSpec } from '../cloud/bigquery.js';
import { bigQuerySchema, type BqField } from '../dataset/bigquery.js';
import { ABSENT, blobs, joinKey, PreconditionFailedError } from '../storage/index.js';

/**
 * The synthetic input tables in BigQuery (REMAINING_WORK.md, W2a). They live in their own dataset, whose
 * name must end in `_synth`, and never in the public dataset (B-54). Truth labels are never loaded
 * (B-55): only the evaluation harness reads `truth.jsonl`, on disk.
 */

/** What a table loader needs; `BigQueryLoader` is the cloud one, tests pass a recorder. */
export interface TableLoader {
  load(spec: LoadSpec): Promise<void>;
}

export const SYNTH_TABLES = {
  entities: SynthEntitySchema,
  relationships: SynthRelationshipSchema,
  loans: SynthLoanSchema,
  transactions: SynthTransactionSchema,
  flags: SynthFlagSchema,
} as const satisfies Record<string, z.AnyZodObject>;
export type SynthTableName = keyof typeof SYNTH_TABLES;
export const SYNTH_TABLE_NAMES: readonly SynthTableName[] = [
  'entities',
  'relationships',
  'loans',
  'transactions',
  'flags',
];

const SYNTH_DATASET = /^[A-Za-z0-9_]{1,1000}_synth$/;

/** B-54: refuses any dataset that is not a synthetic one, before anything is read or written. */
export function assertSynthDataset(name: string): string {
  if (!SYNTH_DATASET.test(name))
    throw new Error(
      `Refusing BigQuery dataset "${name}": synthetic data goes only to a dataset whose name ends in _synth (B-54)`,
    );
  return name;
}

/** Dates and timestamps stay strings, so a row read back parses exactly as the file line did. */
export const synthTableSchema = (table: SynthTableName): BqField[] =>
  bigQuerySchema(SYNTH_TABLES[table], { temporalAsString: true });

/** Writes NDJSON once under a dedicated prefix (create-only, question Q1) and returns its `gs://` URI. */
export async function stageRows(key: string, text: string): Promise<string> {
  const uri = blobs().uri(key);
  if (uri === null)
    throw new Error('BigQuery loads need the gcs store (FINRAKSHAK_AI_STORAGE=gcs)');
  try {
    await blobs().write(key, text, { condition: ABSENT, contentType: 'application/x-ndjson' });
  } catch (e) {
    // Same content hash in the key means the same bytes: a retry reuses the staged object.
    if (!(e instanceof PreconditionFailedError)) throw e;
  }
  return uri;
}

export const contentHash = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Loads validated NDJSON (one string per table) as snapshot tables. The staged key and the job id carry
 * the content hash, so loading the same files again is a no-op (B-24).
 */
export async function loadSynthTables(
  loader: TableLoader,
  dataset: string,
  files: Readonly<Record<SynthTableName, string>>,
): Promise<string[]> {
  assertSynthDataset(dataset);
  const jobs: string[] = [];
  for (const table of SYNTH_TABLE_NAMES) {
    const text = files[table];
    const hash = contentHash(text);
    const uri = await stageRows(joinKey('interim', 'synth-load', hash, `${table}.jsonl`), text);
    const jobId = `synth_${dataset}_${table}_${hash}`;
    await loader.load({ table, uri, schema: synthTableSchema(table), mode: 'replace', jobId });
    jobs.push(jobId);
  }
  return jobs;
}
