#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPath } from './config.js';
import { buildGraph } from './graph/bundle.js';
import { loadProcessed } from './graph/input.js';
import { publishToWeb, writeGraphOutputs } from './graph/outputs.js';
import { scenarioInput, scenarioNotes } from './graph/scenarios.js';
import { errorMessage, log } from './log.js';

/**
 * Graph lab (local, exploratory). Reads data/processed, writes only data/graph/ and,
 * with --web, web/public/graph-lab/ (git-ignored). Usage: node ingest/dist/graphCli.js [--web]
 */
async function main(args: readonly string[]): Promise<void> {
  const input = await loadProcessed();
  if (input.entities.length === 0)
    throw new Error('data/processed is empty — run `ingest build` first');
  const full = buildGraph(input, { synthetic: false, label: 'Public-source graph (real data)' });
  const scenarioBundle = buildGraph(scenarioInput(), {
    synthetic: true,
    label: 'SYNTHETIC test scenarios',
  });
  const scenarios = {
    ...scenarioBundle,
    meta: { ...scenarioBundle.meta, notes: [...scenarioBundle.meta.notes, ...scenarioNotes()] },
  };
  const dir = dataPath('graph');
  const index = await writeGraphOutputs(dir, full, scenarios);
  log.info('graph written', { dir, ...full.meta.counts });
  if (args.includes('--web')) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const webDir = path.resolve(here, '../../web/public/graph-lab');
    await publishToWeb(dir, webDir, index);
    log.info('graph published for the local viewer', { webDir });
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('graph lab failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
