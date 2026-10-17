import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeSmallDataset } from '../test/synthScoring.js';
import { bigQueryScoringInputs, selectSql, type RowQuery } from './bigQueryInputs.js';
import { fileScoringInputs } from './fileInputs.js';
import { SYNTH_TABLE_NAMES } from './synthTables.js';

const dir = writeSmallDataset();
const tableRows = (table: string): unknown[] =>
  readFileSync(path.join(dir, `${table}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l): unknown => JSON.parse(l));

/** Serves each table's file rows, as BigQuery would return them after the W2a load. */
function fakeQuery(overrides: Record<string, () => unknown[]> = {}): RowQuery & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    rows: (q) => {
      sql.push(q);
      const table = /`fundtrace_synth\.(\w+)`/.exec(q)?.[1] ?? '';
      const override = overrides[table];
      return Promise.resolve().then(() => (override ? override() : tableRows(table)));
    },
  };
}

const base = { dataset: 'fundtrace_synth', dataBuiltOn: '2026-10-16', seedReview: null };

describe('bigQueryScoringInputs (W2b)', () => {
  it('returns the same inputs as the file port for the same rows', async () => {
    const q = fakeQuery();
    const fromBq = await bigQueryScoringInputs({ ...base, query: q }).load();
    const fromFile = await fileScoringInputs({
      dir,
      seedReviewFile: path.join(dir, 'none.json'),
    }).load();
    expect(fromBq.loans).toEqual(fromFile.loans);
    expect(fromBq.transactions).toEqual(fromFile.transactions);
    expect(fromBq.records).toEqual(fromFile.records);
    expect(fromBq.links).toEqual(fromFile.links);
    expect(fromBq.dataBuiltOn).toBe('2026-10-16');
    expect(fromBq.missingInputs).toEqual([]);
  });

  it('names its columns and never reads truth labels (B-55)', async () => {
    const q = fakeQuery();
    await bigQueryScoringInputs({ ...base, query: q }).load();
    expect(q.sql).toHaveLength(SYNTH_TABLE_NAMES.length);
    expect(q.sql.join('\n')).not.toMatch(/truth|SELECT \*/);
    expect(selectSql('fundtrace_synth', 'loans')).toContain('`branchId`');
  });

  it('marks a missing optional table and an unpublished build as missing inputs (B-56)', async () => {
    const notFound = (): unknown[] => {
      throw Object.assign(new Error('Not found'), { code: 404 });
    };
    const q = fakeQuery({ flags: notFound });
    const data = await bigQueryScoringInputs({ ...base, dataBuiltOn: null, query: q }).load();
    expect(data.missingInputs).toEqual(['flags', 'public_build']);
    expect(data.records).toEqual([]);
  });

  it('fails on a missing required table or a malformed row', async () => {
    const notFound = (): unknown[] => {
      throw Object.assign(new Error('Not found'), { code: 404 });
    };
    await expect(
      bigQueryScoringInputs({ ...base, query: fakeQuery({ loans: notFound }) }).load(),
    ).rejects.toThrow('Not found');
    const bad = fakeQuery({ loans: () => [{ id: 'L-1', synthetic: false }] });
    await expect(bigQueryScoringInputs({ ...base, query: bad }).load()).rejects.toThrow(
      /loans row 1/,
    );
  });

  it('refuses a dataset that is not synthetic (B-54)', async () => {
    const q = fakeQuery();
    await expect(
      bigQueryScoringInputs({ ...base, dataset: 'fundtrace_public', query: q }).load(),
    ).rejects.toThrow(/B-54/);
    expect(q.sql).toHaveLength(0);
  });
});
