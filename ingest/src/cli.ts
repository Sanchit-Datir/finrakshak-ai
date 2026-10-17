#!/usr/bin/env node
import { SourceIdSchema, type SourceId } from '@fund-tracker/shared';
import { makeContext, runDownloads, runListing } from './acquire.js';
import { dataPath, getConfig, SOURCE_DOC_CAPS, SOURCE_ITEM_CAPS } from './config.js';
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
  acquire <source...> [--list-only|--docs-only] [--full] [--max N] [--max-items N]
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

async function acquireOne(id: SourceId, args: readonly string[]): Promise<SourceRunResult> {
  const adapter = ADAPTERS.get(id);
  if (!adapter) throw new Error(`No automated adapter for ${id} (see data/registry/sources.json)`);
  const max = flagValue(args, '--max') ?? SOURCE_DOC_CAPS[id] ?? getConfig().maxDocsPerSource;
  const ctx = await makeContext(id, flagValue(args, '--max-items') ?? SOURCE_ITEM_CAPS[id]);
  let report: DeltaReport | null = null;
  if (!args.includes('--docs-only'))
    report = await runListing(adapter, ctx, args.includes('--full'));
  if (!args.includes('--list-only')) await runDownloads(adapter, ctx, max);
  return {
    source_id: id,
    status: 'ok',
    mode: report?.mode ?? null,
    added: report?.added.length ?? 0,
    changed: report?.changed.length ?? 0,
    removed: report?.removed.length ?? 0,
    error: null,
  };
}

/** Sources are independent: one failing is recorded and the rest still run; the exit code is 1. */
async function acquire(args: readonly string[]): Promise<void> {
  const runAt = new Date().toISOString();
  const sources: SourceRunResult[] = [];
  for (const id of parseSources(args)) {
    try {
      sources.push(await acquireOne(id, args));
    } catch (e) {
      log.error('source failed', { source: id, error: errorMessage(e) });
      sources.push({
        source_id: id,
        status: 'failed',
        mode: null,
        added: 0,
        changed: 0,
        removed: 0,
        error: errorMessage(e).slice(0, 500),
      });
      process.exitCode = 1;
    }
  }
  await writeRunSummary({ run_at: runAt, sources });
  for (const s of sources) log.info('run summary', { ...s });
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
