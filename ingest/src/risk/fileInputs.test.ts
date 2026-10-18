import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SynthFlagSchema, type SynthEntity, type SynthFlag } from '@finrakshak-ai/shared';
import { writeSmallDataset } from '../test/synthScoring.js';
import { fileScoringInputs, matchRecords, ScoringInputError } from './fileInputs.js';
import type { ScoringData } from './inputs.js';

const entity = (id: string, name: string, kind: SynthEntity['kind'] = 'company'): SynthEntity => ({
  id,
  kind,
  name,
  subtitle: 'SYNTH test entity',
  ownerId: null,
  borrowerId: null,
  synthetic: true,
});

const flagFor = (name: string, dir: string): SynthFlag => {
  const line = readFileSync(path.join(dir, 'flags.jsonl'), 'utf8').split('\n')[0] ?? '{}';
  const flag = SynthFlagSchema.parse(JSON.parse(line));
  return { ...flag, entity: { ...flag.entity, canonical_name: name } };
};

const load = (dir: string, seedReviewFile = path.join(dir, 'none.json')): Promise<ScoringData> =>
  fileScoringInputs({ dir, seedReviewFile }).load();

describe('file scoring inputs', () => {
  const dir = writeSmallDataset();

  it('loads the synthetic files, matching each flag to its borrower', async () => {
    const data = await load(dir);
    expect(data.loans).toHaveLength(9);
    expect(data.records).toHaveLength(2);
    expect(data.records.every((r) => r.entity_id.startsWith('B-'))).toBe(true);
    expect(data).toMatchObject({
      unmatchedRecords: 0,
      missingInputs: [],
      seedReview: null,
      dataBuiltOn: null,
    });
    expect(data.period).toEqual({ startMonth: '2024-01', months: 24 });
  });

  it('matches by exact normalised name only, never an ambiguous one (B-37)', () => {
    const flag = flagFor('SYNTH Alpha Pvt. Ltd.', dir);
    const exact = matchRecords([flag], [entity('B-1', 'SYNTH ALPHA PRIVATE LIMITED')]);
    expect(exact.records.map((r) => r.entity_id)).toEqual(['B-1']);
    const near = matchRecords([flag], [entity('B-1', 'SYNTH Alpha Traders Pvt Ltd')]);
    expect(near).toEqual({ records: [], unmatched: 1 });
    const twice = matchRecords(
      [flag],
      [entity('B-1', 'SYNTH Alpha Pvt Ltd'), entity('B-2', 'SYNTH Alpha Pvt Ltd')],
    );
    expect(twice).toEqual({ records: [], unmatched: 1 });
    const account = matchRecords([flag], [entity('B-1', 'SYNTH Alpha Pvt Ltd', 'account')]);
    expect(account.unmatched).toBe(1);
    const customer = matchRecords(
      [flag],
      [entity('B-1-C1', 'SYNTH Alpha Pvt Ltd', 'counterparty')],
    );
    expect(customer.records.map((r) => r.entity_id)).toEqual(['B-1-C1']);
  });

  it('never reads truth.jsonl (B-55)', async () => {
    const before = await load(dir);
    writeFileSync(path.join(dir, 'truth.jsonl'), 'not json at all\n');
    expect(await load(dir)).toEqual(before);
    rmSync(path.join(dir, 'truth.jsonl'));
    expect(await load(dir)).toEqual(before);
  });

  it('reports a missing optional file as a missing input (B-56)', async () => {
    const copy = writeSmallDataset();
    rmSync(path.join(copy, 'flags.jsonl'));
    const data = await load(copy);
    expect(data.missingInputs).toEqual(['flags']);
    expect(data.records).toEqual([]);
  });

  it('refuses a missing loans file and a malformed line, naming the line', async () => {
    const copy = writeSmallDataset();
    writeFileSync(path.join(copy, 'loans.jsonl'), '{"id":"L-1"}\n');
    await expect(load(copy)).rejects.toThrow(/loans\.jsonl line 1/);
    rmSync(path.join(copy, 'loans.jsonl'));
    await expect(load(copy)).rejects.toBeInstanceOf(ScoringInputError);
  });

  it('reads a seed review and refuses a malformed one', async () => {
    const file = path.join(dir, 'review.json');
    writeFileSync(file, JSON.stringify({ version: 1, cases: [] }));
    expect((await load(dir, file)).seedReview).toEqual({ version: 1, cases: [] });
    writeFileSync(file, JSON.stringify({ version: 2 }));
    await expect(load(dir, file)).rejects.toThrow(/not a seed review file/);
  });
});
