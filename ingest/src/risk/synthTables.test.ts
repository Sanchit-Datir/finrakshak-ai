import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LoadSpec } from '../cloud/bigquery.js';
import { freshGcsLikeStore } from '../test/tempData.js';
import { writeSmallDataset } from '../test/synthScoring.js';
import {
  assertSynthDataset,
  loadSynthTables,
  SYNTH_TABLE_NAMES,
  synthTableSchema,
  type SynthTableName,
} from './synthTables.js';

const store = freshGcsLikeStore();
const dir = writeSmallDataset();
const files = Object.fromEntries(
  SYNTH_TABLE_NAMES.map((t) => [t, readFileSync(path.join(dir, `${t}.jsonl`), 'utf8')]),
) as Record<SynthTableName, string>;

const recorder = (): { specs: LoadSpec[]; load: (s: LoadSpec) => Promise<void> } => {
  const specs: LoadSpec[] = [];
  return {
    specs,
    load: (s) => {
      specs.push(s);
      return Promise.resolve();
    },
  };
};

describe('assertSynthDataset (B-54)', () => {
  it('accepts only datasets whose name ends in _synth', () => {
    expect(assertSynthDataset('fundtrace_synth')).toBe('fundtrace_synth');
    for (const bad of [
      'fundtrace_public',
      'fundtrace_public_dryrun',
      'synth',
      'fundtrace_synth_x',
      'a-b_synth',
      '',
    ])
      expect(() => assertSynthDataset(bad)).toThrow(/B-54/);
  });
});

describe('synthTableSchema', () => {
  it('derives every table and keeps dates and timestamps as strings', () => {
    for (const t of SYNTH_TABLE_NAMES) expect(synthTableSchema(t).length).toBeGreaterThan(0);
    const tx = synthTableSchema('transactions');
    expect(tx.find((f) => f.name === 'at')).toMatchObject({ type: 'STRING', mode: 'REQUIRED' });
    expect(tx.find((f) => f.name === 'synthetic')).toMatchObject({ type: 'BOOL' });
    const flag = synthTableSchema('flags');
    expect(flag.find((f) => f.name === 'event')).toMatchObject({ type: 'RECORD' });
  });
});

describe('loadSynthTables', () => {
  it('stages each table once and loads it as a snapshot with a content-hash job id', async () => {
    const r = recorder();
    const jobs = await loadSynthTables(r, 'fundtrace_synth', files);
    expect(r.specs.map((s) => s.table)).toEqual([...SYNTH_TABLE_NAMES]);
    expect(r.specs.every((s) => s.mode === 'replace' && s.uri.startsWith('gs://'))).toBe(true);
    expect(jobs).toEqual(r.specs.map((s) => s.jobId));
    const staged = await store.list('interim/synth-load');
    expect(staged).toHaveLength(SYNTH_TABLE_NAMES.length);
    expect(staged.some((b) => b.key.includes('truth'))).toBe(false);
  });

  it('is a no-op to load the same files again (same keys and job ids, B-24)', async () => {
    const a = recorder();
    const b = recorder();
    expect(await loadSynthTables(a, 'fundtrace_synth', files)).toEqual(
      await loadSynthTables(b, 'fundtrace_synth', files),
    );
  });

  it('refuses a non-synthetic dataset before staging anything', async () => {
    const r = recorder();
    await expect(loadSynthTables(r, 'fundtrace_public', files)).rejects.toThrow(/B-54/);
    expect(r.specs).toHaveLength(0);
  });
});
