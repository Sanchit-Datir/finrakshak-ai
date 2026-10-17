import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generate } from '../synth/generate.js';
import { serialise } from '../synth/output.js';

/**
 * A small synthetic dataset (SYNTH, B-54) written to a fresh temp folder, for the scoring tests: a few
 * controls, slow burns, sudden enforcements and fund diversions over 24 months.
 */
export function writeSmallDataset(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fundtrace-score-'));
  const data = generate({
    seed: 7,
    months: 24,
    allocation: { control: 3, slow_burn: 2, sudden_enforcement: 2, fund_diversion: 2 },
  });
  const { files, manifest } = serialise(data);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}
