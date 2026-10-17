import { BigQuery, type Job, type JobOptions } from '@google-cloud/bigquery';
import type { BqField } from '../dataset/bigquery.js';
import { log } from '../log.js';

export interface LoadSpec {
  readonly table: string;
  /** `gs://` URI of a newline-delimited JSON object. */
  readonly uri: string;
  readonly schema: readonly BqField[];
  /** `replace`: atomic snapshot swap via a staging table. `append`: history rows. */
  readonly mode: 'replace' | 'append';
  /** DATE column to partition history tables by (cheap date-bounded queries). */
  readonly partitionBy?: string;
  readonly clusterBy?: readonly string[];
  /**
   * Deterministic job id (letters, digits, `_`, `-`). BigQuery refuses a second job with the same
   * id, which makes a retried append a no-op instead of duplicate rows (B-24).
   */
  readonly jobId?: string;
}

type JobConfiguration = NonNullable<JobOptions['configuration']>;

function httpCode(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null || !('code' in e)) return undefined;
  return typeof e.code === 'number' ? e.code : undefined;
}

type TableFields = NonNullable<
  NonNullable<NonNullable<JobConfiguration['load']>['schema']>['fields']
>;

/** Mutable copy in the shape the client expects (our schema types are readonly). */
function toFields(fields: readonly BqField[]): TableFields {
  return fields.map((f) => ({
    name: f.name,
    type: f.type,
    mode: f.mode,
    ...(f.fields === undefined ? {} : { fields: toFields(f.fields) }),
  }));
}

/** Bound on every BigQuery job (CLAUDE.md: every external call has a timeout). */
const JOB_TIMEOUT_MS = 10 * 60_000;

async function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} timed out after ${JOB_TIMEOUT_MS / 1000}s`));
    }, JOB_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads pipeline output into BigQuery with batch load jobs (free, unlike streaming inserts).
 * Snapshot tables are replaced atomically: load into `<table>__staging`, then one copy job
 * overwrites `<table>`, so readers never see a half-loaded table.
 */
export class BigQueryLoader {
  private readonly bq: BigQuery;

  constructor(
    private readonly dataset: string,
    private readonly location: string,
    projectId?: string,
  ) {
    this.bq = new BigQuery({ ...(projectId === undefined ? {} : { projectId }), location });
  }

  private async run(configuration: JobConfiguration, what: string, jobId?: string): Promise<void> {
    let job: Job;
    try {
      [job] = await this.bq.createJob({
        configuration,
        location: this.location,
        ...(jobId === undefined ? {} : { jobId }),
      });
    } catch (e) {
      if (jobId !== undefined && httpCode(e) === 409) {
        log.info('bigquery job already ran', { jobId });
        return;
      }
      throw new Error(`BigQuery ${what} failed to start`, { cause: e });
    }
    await withTimeout(job.promise(), what);
  }

  private tableRef(table: string): Record<string, string> {
    return { projectId: this.bq.projectId, datasetId: this.dataset, tableId: table };
  }

  async load(spec: LoadSpec): Promise<void> {
    const target = spec.mode === 'replace' ? `${spec.table}__staging` : spec.table;
    await this.run(
      {
        load: {
          sourceUris: [spec.uri],
          sourceFormat: 'NEWLINE_DELIMITED_JSON',
          destinationTable: this.tableRef(target),
          schema: { fields: toFields(spec.schema) },
          writeDisposition: spec.mode === 'replace' ? 'WRITE_TRUNCATE' : 'WRITE_APPEND',
          createDisposition: 'CREATE_IF_NEEDED',
          ...(spec.partitionBy === undefined
            ? {}
            : { timePartitioning: { type: 'DAY', field: spec.partitionBy } }),
          ...(spec.clusterBy === undefined ? {} : { clustering: { fields: [...spec.clusterBy] } }),
        },
      },
      `load ${target}`,
      spec.jobId,
    );
    if (spec.mode === 'replace')
      await this.run(
        {
          copy: {
            sourceTables: [this.tableRef(target)],
            destinationTable: this.tableRef(spec.table),
            writeDisposition: 'WRITE_TRUNCATE',
            createDisposition: 'CREATE_IF_NEEDED',
          },
        },
        `swap ${spec.table}`,
        spec.jobId === undefined ? undefined : `${spec.jobId}_swap`,
      );
    log.info('bigquery loaded', { dataset: this.dataset, table: spec.table, mode: spec.mode });
  }
}
