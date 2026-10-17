import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BqField } from '../dataset/bigquery.js';

const jobs = vi.hoisted(
  () => [] as { configuration: Record<string, unknown>; jobId?: string; location?: string }[],
);
const failWith = vi.hoisted(() => ({ code: 0 }));

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: class {
    projectId = 'proj';
    createJob(opts: { configuration: Record<string, unknown>; jobId?: string }): Promise<unknown> {
      jobs.push(opts);
      if (failWith.code)
        return Promise.reject(Object.assign(new Error('fail'), { code: failWith.code }));
      return Promise.resolve([{ promise: () => Promise.resolve([{}]) }]);
    }
  },
}));

const { BigQueryLoader } = await import('./bigquery.js');
const schema: BqField[] = [
  { name: 'a', type: 'STRING', mode: 'REQUIRED' },
  {
    name: 'r',
    type: 'RECORD',
    mode: 'NULLABLE',
    fields: [{ name: 'b', type: 'INT64', mode: 'NULLABLE' }],
  },
];

beforeEach(() => {
  jobs.length = 0;
  failWith.code = 0;
});

describe('BigQueryLoader', () => {
  it('replaces a snapshot through a staging table and an atomic copy', async () => {
    await new BigQueryLoader('ds', 'asia-south1').load({
      table: 'entities',
      uri: 'gs://b/x.jsonl',
      schema,
      mode: 'replace',
      jobId: 'tables_entities_v1',
    });
    expect(jobs).toHaveLength(2);
    const [load, copy] = jobs;
    expect(load?.jobId).toBe('tables_entities_v1');
    expect(load?.configuration['load']).toMatchObject({
      destinationTable: { datasetId: 'ds', tableId: 'entities__staging' },
      writeDisposition: 'WRITE_TRUNCATE',
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: [{ name: 'a' }, { name: 'r', fields: [{ name: 'b', type: 'INT64' }] }] },
    });
    expect(copy?.jobId).toBe('tables_entities_v1_swap');
    expect(copy?.configuration['copy']).toMatchObject({
      destinationTable: { tableId: 'entities' },
      writeDisposition: 'WRITE_TRUNCATE',
    });
  });

  it('appends history to a partitioned, clustered table', async () => {
    await new BigQueryLoader('ds', 'asia-south1').load({
      table: 'delta_events',
      uri: 'gs://b/d.jsonl',
      schema,
      mode: 'append',
      partitionBy: 'run_date',
      clusterBy: ['source_id'],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.configuration['load']).toMatchObject({
      destinationTable: { tableId: 'delta_events' },
      writeDisposition: 'WRITE_APPEND',
      timePartitioning: { type: 'DAY', field: 'run_date' },
      clustering: { fields: ['source_id'] },
    });
  });

  it('treats a duplicate job id as already done (no double load, B-24)', async () => {
    failWith.code = 409;
    await expect(
      new BigQueryLoader('ds', 'l').load({
        table: 't',
        uri: 'gs://b/t',
        schema,
        mode: 'append',
        jobId: 'history_t_run1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      new BigQueryLoader('ds', 'l').load({ table: 't', uri: 'gs://b/t', schema, mode: 'append' }),
    ).rejects.toThrow(/failed to start/);
  });
});
