#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage, log } from './log.js';
import { scaleAllocation } from './synth/allocation.js';
import { USAGE, parseArgs } from './synth/cliArgs.js';
import { generate } from './synth/generate.js';
import { writeDataset } from './synth/output.js';
import { buildSample } from './synth/sample.js';

/**
 * Synthetic loans and transactions (docs/plans/SYNTHETIC_TRANSACTIONS_PLAN.md). Fictional data only,
 * written under data/synthetic/ (B-54) and never into data/raw, data/processed or data/registry.
 */
function main(argv: readonly string[]): void {
  if (argv.includes('--help')) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const args = parseArgs(argv);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (args.sample) {
    const target = path.join(repoRoot, 'web/src/lib/synth-sample.json');
    writeFileSync(target, buildSample());
    log.info('contract sample written', { target });
    return;
  }
  const data = generate({
    seed: args.seed,
    months: args.months,
    allocation: scaleAllocation(args.customers),
  });
  const dir = writeDataset(data, args.out, repoRoot);
  log.info('synthetic data written', {
    dir,
    loans: data.loans.length,
    transactions: data.transactions.length,
    flags: data.flags.length,
  });
  if (data.notBuilt.length > 0)
    log.warn('some scenarios are not built yet and were skipped', {
      scenarios: data.notBuilt.join(','),
    });
}

try {
  main(process.argv.slice(2));
} catch (e: unknown) {
  log.error('synthetic data failed', { error: errorMessage(e) });
  process.exitCode = 1;
}
