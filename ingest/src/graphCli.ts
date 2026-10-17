#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishToWeb } from './graph/outputs.js';
import { errorMessage, log } from './log.js';
import { buildGraphOutputs } from './pipeline/graph.js';

/**
 * Graph lab (local, exploratory). Reads data/processed, writes only data/graph/ and,
 * with --web, web/public/graph-lab/ (git-ignored). Usage: node ingest/dist/graphCli.js [--web]
 */
async function main(args: readonly string[]): Promise<void> {
  const { prefix, index } = await buildGraphOutputs();
  if (args.includes('--web')) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const webDir = path.resolve(here, '../../web/public/graph-lab');
    await publishToWeb(prefix, webDir, index);
    log.info('graph published for the local viewer', { webDir });
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('graph lab failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
