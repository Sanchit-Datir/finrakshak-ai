import { BigQuery } from '@google-cloud/bigquery';
import type { SeedVerificationFile } from '@finrakshak-ai/shared';
import type { z } from 'zod';
import { matchRecords, ScoringInputError } from './fileInputs.js';
import type { ScoringData, ScoringInputPort } from './inputs.js';
import { assertSynthDataset, SYNTH_TABLES, type SynthTableName } from './synthTables.js';

/**
 * BigQuery implementation of the input port (REMAINING_WORK.md, W2b). Loans, transactions, entities,
 * relationships and public-record flags come from the synthetic dataset only (B-54): the flags name
 * SYNTH companies, so the real public tables could never match them. The public data date comes from the
 * published build the caller read (B-43, B-50). Every row is parsed with zod; truth labels are never
 * loaded into BigQuery, so they cannot be read here (B-55).
 */

/** Runs one parameterless, read-only query; the cloud one is bounded in bytes and time. */
export interface RowQuery {
  rows(sql: string): Promise<unknown[]>;
}

/** B-15: a scoring query may bill at most 1 GiB (the synthetic set is a few MB). */
const MAX_BYTES_BILLED = String(1024 * 1024 * 1024);
const QUERY_TIMEOUT_MS = 120_000;

export class BigQueryRows implements RowQuery {
  private readonly bq: BigQuery;

  constructor(
    private readonly location: string,
    projectId?: string,
  ) {
    this.bq = new BigQuery({ ...(projectId === undefined ? {} : { projectId }), location });
  }

  async rows(sql: string): Promise<unknown[]> {
    const [rows] = await this.bq.query({
      query: sql,
      location: this.location,
      maximumBytesBilled: MAX_BYTES_BILLED,
      jobTimeoutMs: QUERY_TIMEOUT_MS,
    });
    // Rows are untyped until the caller parses them with zod.
    const out: unknown[] = rows;
    return out;
  }
}

function httpCode(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null || !('code' in e)) return undefined;
  return typeof e.code === 'number' ? e.code : undefined;
}

/** Named columns, never `SELECT *`; table and column names come from code, not from input. */
export const selectSql = (dataset: string, table: SynthTableName): string => {
  const columns = Object.keys(SYNTH_TABLES[table].shape).map((c) => `\`${c}\``);
  return `SELECT ${columns.join(', ')} FROM \`${dataset}.${table}\``;
};

function parseRows<T>(
  table: string,
  rows: readonly unknown[],
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T[] {
  return rows.map((row, i) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success)
      throw new ScoringInputError(
        `${table} row ${i + 1}: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    return parsed.data;
  });
}

export interface BigQueryInputOptions {
  readonly query: RowQuery;
  /** Must end in `_synth` (B-54). */
  readonly dataset: string;
  /** IST day of the published public build, or null when nothing is published yet (B-56). */
  readonly dataBuiltOn: string | null;
  readonly seedReview: SeedVerificationFile | null;
}

async function load(opts: BigQueryInputOptions): Promise<ScoringData> {
  const dataset = assertSynthDataset(opts.dataset);
  const missing: string[] = [];
  const read = async <T>(
    table: SynthTableName,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    optional: boolean,
  ): Promise<T[]> => {
    try {
      return parseRows(table, await opts.query.rows(selectSql(dataset, table)), schema);
    } catch (e) {
      if (!optional || httpCode(e) !== 404) throw e;
      missing.push(table);
      return [];
    }
  };
  const entities = await read('entities', SYNTH_TABLES.entities, false);
  const links = await read('relationships', SYNTH_TABLES.relationships, true);
  const loans = await read('loans', SYNTH_TABLES.loans, false);
  const transactions = await read('transactions', SYNTH_TABLES.transactions, false);
  const flags = await read('flags', SYNTH_TABLES.flags, true);
  if (opts.dataBuiltOn === null) missing.push('public_build');
  const { records, unmatched } = matchRecords(flags, entities);
  return {
    loans,
    transactions,
    entities,
    links,
    records,
    seedReview: opts.seedReview,
    dataBuiltOn: opts.dataBuiltOn,
    period: null,
    missingInputs: missing,
    unmatchedRecords: unmatched,
  };
}

export const bigQueryScoringInputs = (opts: BigQueryInputOptions): ScoringInputPort => ({
  load: () => load(opts),
});
