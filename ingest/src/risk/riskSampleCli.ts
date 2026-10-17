#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage, log } from '../log.js';
import { buildRiskSample, RISK_SAMPLE_PATH } from './riskSample.js';

/** Rebuilds the app's bundled sample of SYNTH risk scores: node ingest/dist/risk/riskSampleCli.js */
async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const target = path.join(repoRoot, RISK_SAMPLE_PATH);
  const sample = await buildRiskSample();
  writeFileSync(target, `${JSON.stringify(sample)}\n`);
  log.info('risk score sample written', { target, loans: sample.scores.length });
}

main().catch((e: unknown) => {
  log.error('risk score sample failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
