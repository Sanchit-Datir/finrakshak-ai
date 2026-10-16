#!/usr/bin/env node
import { SourceIdSchema, type SourceId } from '@fund-tracker/shared';
import { makeContext, runDownloads, runListing } from './acquire.js';
import { dataPath, getConfig } from './config.js';
import { buildDataset } from './dataset/build.js';
import { extractAllText } from './extract/runExtract.js';
import { errorMessage, log } from './log.js';
import { edAdapter } from './sources/ed.js';
import { ibbiAdapter } from './sources/ibbi.js';
import { nfraAdapter } from './sources/nfra.js';
import { SOURCE_REGISTRY } from './sources/registry.js';
import { rbiAdapter } from './sources/rbi.js';
import { sebiAdapter } from './sources/sebi.js';
import { sfioAdapter } from './sources/sfio.js';
import type { SourceAdapter } from './sources/types.js';
import { writeJson } from './store/jsonl.js';

const ADAPTERS: ReadonlyMap<SourceId, SourceAdapter> = new Map(
  [nfraAdapter, sfioAdapter, edAdapter, sebiAdapter, ibbiAdapter, rbiAdapter].map((a) => [a.id, a]),
);

const USAGE = `Usage: ingest <command> [options]
  registry                         write data/registry/sources.json
  acquire <source...> [--list-only|--docs-only] [--max N]
                                   sources: ${[...ADAPTERS.keys()].join(', ')}, all
  extract                          extract text from downloaded documents
  build                            build the canonical dataset in data/processed`;

function parseSources(args: readonly string[]): SourceId[] {
  const names = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  if (names.includes('all')) return [...ADAPTERS.keys()];
  return names.map((n) => SourceIdSchema.parse(n));
}

function flagValue(args: readonly string[], flag: string): number | undefined {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isSafeInteger(v) && v >= 0 ? v : undefined;
}

async function acquire(args: readonly string[]): Promise<void> {
  const max = flagValue(args, '--max') ?? getConfig().maxDocsPerSource;
  for (const id of parseSources(args)) {
    const adapter = ADAPTERS.get(id);
    if (!adapter)
      throw new Error(`No automated adapter for ${id} (see data/registry/sources.json)`);
    const ctx = await makeContext(id);
    if (!args.includes('--docs-only')) await runListing(adapter, ctx);
    if (!args.includes('--list-only')) await runDownloads(adapter, ctx, max);
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command ?? '') {
    case 'registry':
      await writeJson(dataPath('registry', 'sources.json'), SOURCE_REGISTRY);
      return;
    case 'acquire':
      return acquire(rest);
    case 'extract':
      return extractAllText([...ADAPTERS.keys()]);
    case 'build':
      return buildDataset([...ADAPTERS.values()]);
    default:
      process.stderr.write(`${USAGE}\n`);
      process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('ingest failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
