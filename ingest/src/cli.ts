#!/usr/bin/env node
import { SourceIdSchema, type SourceId } from '@fund-tracker/shared';
import { dataKey, dataPath } from './config.js';
import { withLock } from './delta/lock.js';
import { writeRunSummary, type SourceRunResult } from './delta/report.js';
import { buildDataset } from './dataset/build.js';
import { extractAllText } from './extract/runExtract.js';
import { errorMessage, log } from './log.js';
import { acquireSource, failure, listingResult } from './pipeline/acquireSource.js';
import { ADAPTERS, AUTOMATED_SOURCES } from './pipeline/adapters.js';
import { SOURCE_REGISTRY } from './sources/registry.js';
import { writeJson } from './store/jsonl.js';

const USAGE = `Usage: ingest <command> [options]
  registry                         write data/registry/sources.json
  acquire <source...> [--list-only|--docs-only] [--full] [--allow-shrink]
                                   [--max N] [--max-items N]
                                   sources: ${[...ADAPTERS.keys()].join(', ')}, all
  extract                          extract text from downloaded documents
  build                            build the canonical dataset in data/processed`;

function parseSources(args: readonly string[]): SourceId[] {
  const names = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  if (names.includes('all')) return [...AUTOMATED_SOURCES];
  return names.map((n) => SourceIdSchema.parse(n));
}

function flagValue(args: readonly string[], flag: string): number | undefined {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isSafeInteger(v) && v >= 0 ? v : undefined;
}

async function acquireOne(
  id: SourceId,
  args: readonly string[],
  runAt: string,
): Promise<SourceRunResult> {
  const maxDocs = flagValue(args, '--max');
  const maxItems = flagValue(args, '--max-items');
  const { result } = await acquireSource(id, {
    runAt,
    forceFull: args.includes('--full'),
    allowShrink: args.includes('--allow-shrink'),
    listOnly: args.includes('--list-only'),
    docsOnly: args.includes('--docs-only'),
    ...(maxDocs === undefined ? {} : { maxDocs }),
    ...(maxItems === undefined ? {} : { maxItems }),
  });
  return result;
}

/**
 * Sources are independent: one failing is recorded and the rest still run (exit code 1). The whole
 * run holds a lock so two acquire runs never merge the same listings at once.
 */
async function acquire(args: readonly string[]): Promise<void> {
  const ids = parseSources(args);
  const runAt = new Date().toISOString();
  const sources = await withLock(dataPath('interim', 'acquire.lock'), async () => {
    const results: SourceRunResult[] = [];
    for (const id of ids) {
      try {
        results.push(await acquireOne(id, args, runAt));
      } catch (e) {
        results.push(failure(listingResult(id, null), 'setup', e));
      }
    }
    await writeRunSummary({ run_at: runAt, sources: results });
    return results;
  });
  for (const s of sources) log.info('run summary', { ...s });
  if (sources.some((s) => s.status === 'failed')) process.exitCode = 1;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command ?? '') {
    case 'registry':
      await writeJson(dataKey('registry', 'sources.json'), SOURCE_REGISTRY);
      return;
    case 'acquire':
      return acquire(rest);
    case 'extract':
      await extractAllText(AUTOMATED_SOURCES);
      return;
    case 'build':
      await buildDataset([...ADAPTERS.values()]);
      return;
    default:
      process.stderr.write(`${USAGE}\n`);
      process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('ingest failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
