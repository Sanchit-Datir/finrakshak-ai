import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SynthManifestSchema } from '@fund-tracker/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { generate } from './generate.js';
import { SynthGuardError } from './guards.js';
import { serialise, writeDataset } from './output.js';

const data = generate({
  seed: 3,
  allocation: { control: 2, slow_burn: 1, sudden_enforcement: 1, fund_diversion: 1 },
});
const scratch = mkdtempSync(path.join(tmpdir(), 'synth-out-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('serialise', () => {
  it('writes one JSON object per line, ending with a newline', () => {
    const { files } = serialise(data);
    for (const [name, text] of Object.entries(files)) {
      expect(text.endsWith('\n') || text === '', name).toBe(true);
      for (const line of text.split('\n').filter((l) => l !== ''))
        expect(() => {
          JSON.parse(line);
        }, name).not.toThrow();
    }
    expect(files['loans.jsonl']?.split('\n').filter(Boolean)).toHaveLength(5);
  });

  it('puts the sha256 of each file in the manifest, with counts that match', () => {
    const { files, manifest } = serialise(data);
    for (const [name, text] of Object.entries(files))
      expect(manifest.sha256[name]).toBe(createHash('sha256').update(text).digest('hex'));
    expect(manifest.counts['loans']).toBe(5);
    expect(manifest.counts['transactions']).toBe(data.transactions.length);
    expect(manifest.counts['flags']).toBe(1);
    expect(manifest.counts['archetype_control']).toBe(2);
    expect(manifest.as_of_start).toBe('2024-01-01');
    expect(SynthManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('holds no clock time, so a manifest from a second run is identical', () => {
    expect(
      JSON.stringify(
        serialise(
          generate({
            seed: 3,
            allocation: { control: 2, slow_burn: 1, sudden_enforcement: 1, fund_diversion: 1 },
          }),
        ).manifest,
      ),
    ).toBe(JSON.stringify(serialise(data).manifest));
  });
});

describe('writeDataset', () => {
  it('writes the six files and the manifest, byte-identical on a second write', () => {
    const dir = writeDataset(data, 'out-a', scratch);
    expect(readdirSync(dir).sort()).toEqual([
      'entities.jsonl',
      'flags.jsonl',
      'loans.jsonl',
      'manifest.json',
      'relationships.jsonl',
      'transactions.jsonl',
      'truth.jsonl',
    ]);
    const before = readFileSync(path.join(dir, 'transactions.jsonl'), 'utf8');
    writeDataset(data, 'out-a', scratch);
    expect(readFileSync(path.join(dir, 'transactions.jsonl'), 'utf8')).toBe(before);
    expect(before).toBe(serialise(data).files['transactions.jsonl']);
  });

  it('refuses to write into the real data folders (B-54)', () => {
    for (const out of ['data/raw/x', 'data/processed', 'data/registry/y'])
      expect(() => writeDataset(data, out, scratch), out).toThrow(SynthGuardError);
    expect(readdirSync(scratch)).not.toContain('data');
  });

  it('refuses to write anything that looks like a real identifier', () => {
    const bad = {
      ...data,
      entities: data.entities.map((e, i) => (i === 3 ? { ...e, name: 'SYNTH ABCDE1234F' } : e)),
    };
    expect(() => writeDataset(bad, 'out-b', scratch)).toThrow(/PAN/);
    expect(readdirSync(scratch)).not.toContain('out-b');
  });
});
