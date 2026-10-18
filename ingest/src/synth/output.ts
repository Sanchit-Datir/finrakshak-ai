import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SynthManifestSchema, type SynthManifest } from '@finrakshak-ai/shared';
import { monthStart } from './calendar.js';
import { GENERATOR_VERSION, type SynthDataset } from './generate.js';
import { assertNoRealIdentifiers, assertSafeOutputDir } from './guards.js';

const jsonl = (rows: readonly unknown[]): string =>
  rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : '');

export interface Serialised {
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: SynthManifest;
}

/** The dataset as file contents plus a manifest with each file's hash. No clock, so a rerun is byte-identical. */
export function serialise(d: SynthDataset): Serialised {
  const files = {
    'entities.jsonl': jsonl(d.entities),
    'relationships.jsonl': jsonl(d.relationships),
    'loans.jsonl': jsonl(d.loans),
    'transactions.jsonl': jsonl(d.transactions),
    'flags.jsonl': jsonl(d.flags),
    'truth.jsonl': jsonl(d.truth),
  };
  const counts: Record<string, number> = {
    entities: d.entities.length,
    relationships: d.relationships.length,
    loans: d.loans.length,
    transactions: d.transactions.length,
    flags: d.flags.length,
    truth: d.truth.length,
  };
  for (const t of d.truth)
    counts[`archetype_${t.archetype}`] = (counts[`archetype_${t.archetype}`] ?? 0) + 1;
  const sha256 = Object.fromEntries(
    Object.entries(files).map(([name, text]) => [
      name,
      createHash('sha256').update(text).digest('hex'),
    ]),
  );
  const manifest = SynthManifestSchema.parse({
    seed: d.seed,
    generator_version: GENERATOR_VERSION,
    as_of_start: monthStart(d.startMonth),
    months: d.months,
    counts,
    sha256,
    synthetic: true,
  });
  return { files, manifest };
}

/** Writes the files under `outDir` (never inside real data, B-54) after scanning them for real-looking identifiers. */
export function writeDataset(d: SynthDataset, outDir: string, repoRoot: string): string {
  const dir = assertSafeOutputDir(outDir, repoRoot);
  const { files, manifest } = serialise(d);
  for (const text of Object.values(files)) assertNoRealIdentifiers(text.split('\n'));
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}
