#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { BigQueryLoader } from '../cloud/bigquery.js';
import { getConfig } from '../config.js';
import { errorMessage, log } from '../log.js';
import { readJsonl } from './fileInputs.js';
import {
  assertSynthDataset,
  loadSynthTables,
  SYNTH_TABLE_NAMES,
  SYNTH_TABLES,
  type SynthTableName,
} from './synthTables.js';

/**
 * Loads `data/synthetic/*.jsonl` (never `truth.jsonl`, B-55) into the synthetic BigQuery dataset
 * (REMAINING_WORK.md, W2a). Run where Application Default Credentials and FINRAKSHAK_AI_STORAGE=gcs are set:
 *   node ingest/dist/risk/synthLoadCli.js [--in data/synthetic] [--dataset fundtrace_synth]
 */

const value = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Every line is parsed with zod first; a bad line stops the load with its file and line number. */
function ndjson<T>(
  dir: string,
  table: SynthTableName,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): string {
  const file = path.join(dir, `${table}.jsonl`);
  if (!existsSync(file)) throw new Error(`${table}.jsonl is missing in ${dir}; run npm run synth`);
  return readJsonl(file, schema)
    .map((row) => JSON.stringify(row))
    .join('\n');
}

function readTables(dir: string): Record<SynthTableName, string> {
  return {
    entities: ndjson(dir, 'entities', SYNTH_TABLES.entities),
    relationships: ndjson(dir, 'relationships', SYNTH_TABLES.relationships),
    loans: ndjson(dir, 'loans', SYNTH_TABLES.loans),
    transactions: ndjson(dir, 'transactions', SYNTH_TABLES.transactions),
    flags: ndjson(dir, 'flags', SYNTH_TABLES.flags),
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const dir = path.resolve(repoRoot, value(argv, '--in') ?? 'data/synthetic');
  const dataset = assertSynthDataset(
    value(argv, '--dataset') ?? process.env['FINRAKSHAK_AI_SYNTH_DATASET'] ?? 'fundtrace_synth',
  );
  const storage = getConfig().storage;
  if (storage.kind !== 'gcs')
    throw new Error('Set FINRAKSHAK_AI_STORAGE=gcs: BigQuery loads read Cloud Storage');
  const location = process.env['FINRAKSHAK_AI_BIGQUERY_LOCATION'] ?? 'asia-south1';
  const loader = new BigQueryLoader(dataset, location, storage.projectId);
  const jobs = await loadSynthTables(loader, dataset, readTables(dir));
  log.info('synthetic tables loaded', {
    dataset,
    tables: SYNTH_TABLE_NAMES.join(','),
    jobs: jobs.length,
  });
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('synthetic load failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
