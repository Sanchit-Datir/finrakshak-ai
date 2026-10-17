#!/usr/bin/env node
import { SourceIdSchema, type SourceId } from '@fund-tracker/shared';
import { makeContext, runDownloads, runListing } from './acquire.js';
import { dataPath, getConfig, SOURCE_DOC_CAPS, SOURCE_ITEM_CAPS } from './config.js';
import { withLock } from './delta/lock.js';
import { writeRunSummary, type DeltaReport, type RunSummary } from './delta/report.js';
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

type SourceRunResult = RunSummary['sources'][number];

const ADAPTERS: ReadonlyMap<SourceId, SourceAdapter> = new Map(
  [nfraAdapter, sfioAdapter, edAdapter, sebiAdapter, ibbiAdapter, rbiAdapter].map((a) => [a.id, a]),
);

const USAGE = `Usage: ingest <command> [options]
  registry                         write data/registry/sources.json
  acquire <source...> [--list-only|--docs-only] [--full] [--allow-shrink]
                                   [--max N] [--max-items N]
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

const listingResult = (id: SourceId, report: DeltaReport | null): SourceRunResult => ({
  source_id: id,
  status: 'ok',
  mode: report?.mode ?? null,
  added: report?.added.length ?? 0,
  changed: report?.changed.length ?? 0,
  removed: report?.removed.length ?? 0,
  error: null,
});

const failure = (result: SourceRunResult, step: string, e: unknown): SourceRunResult => {
  log.error('source failed', { source: result.source_id, step, error: errorMessage(e) });
  return { ...result, status: 'failed', error: `${step}: ${errorMessage(e)}`.slice(0, 500) };
};

async function acquireOne(
  id: SourceId,
  args: readonly string[],
  runAt: string,
): Promise<SourceRunResult> {
  const adapter = ADAPTERS.get(id);
  if (!adapter) throw new Error(`No automated adapter for ${id} (see data/registry/sources.json)`);
  const max = flagValue(args, '--max') ?? SOURCE_DOC_CAPS[id] ?? getConfig().maxDocsPerSource;
  const ctx = await makeContext(id, flagValue(args, '--max-items') ?? SOURCE_ITEM_CAPS[id], runAt);
  let report: DeltaReport | null = null;
  try {
    if (!args.includes('--docs-only'))
      report = await runListing(adapter, ctx, {
        forceFull: args.includes('--full'),
        allowShrink: args.includes('--allow-shrink'),
      });
  } catch (e) {
    return failure(listingResult(id, null), 'listing', e);
  }
  const result = listingResult(id, report);
  if (args.includes('--list-only')) return result;
  try {
    await runDownloads(adapter, ctx, max, new Set(report?.changed ?? []));
    return result;
  } catch (e) {
    return failure(result, 'downloads', e);
  }
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
