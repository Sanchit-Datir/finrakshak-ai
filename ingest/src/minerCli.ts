#!/usr/bin/env node
import { SeedVerificationFileSchema } from '@fund-tracker/shared';
import { dataKey } from './config.js';
import { errorMessage, log } from './log.js';
import { readAiConfig } from './ai/config.js';
import { modelFor } from './ai/models.js';
import { minerInputHash, reviewCandidates, scriptedReview } from './miner/agent.js';
import { mineCandidates } from './miner/candidates.js';
import { loadMinerContext } from './miner/load.js';
import { MINE_PROMPT_VERSION } from './miner/prompts/mine.js';
import { MAX_PATTERN_PROPOSALS, planProposals } from './miner/proposals.js';
import { DEFAULT_MINER_SETTINGS } from './miner/settings.js';
import { loadPopulation } from './miner/population.js';
import { formatCandidates, parseCandidateArgs } from './miner/report.js';
import { applySheet, buildSheet, parseSheet, summarise } from './miner/review.js';
import { seedCases } from './miner/seedTimelines.js';
import { readTimelines } from './miner/timelines.js';
import { istToday } from './miner/today.js';
import { blobs } from './storage/index.js';
import { readJson, writeJson } from './store/jsonl.js';

/**
 * Pattern miner tools (docs/plans/PATTERN_MINER_PLAN.md). So far: the seed verification sheet and the candidate finder. It reads
 * data/processed and writes only data/verification/ (new files; the processed data is never changed).
 */

const SHEET_KEY = dataKey('verification', 'seed_review_sheet.csv');
const REVIEW_KEY = dataKey('verification', 'seed_review.json');

const USAGE = `Usage: node ingest/dist/minerCli.js <command>
  verify-sheet [--case id,id] [--force]   write the review sheet (data/verification/seed_review_sheet.csv)
  verify-apply --reviewer NAME            read the filled sheet and save the decisions (seed_review.json)
  verify-status                           show how far the review has got
  candidates [--min-lift N] [--min-support N] [--min-population N] [--json]
                                          find sequences the seed cases share (no model is used)
  propose [--allow-billed]                print the proposals the miner agent would make; writes nothing
                                          (mock model unless FUNDTRACE_AI_PROVIDER is set)`;

const flag = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const readReview = (): Promise<ReturnType<typeof SeedVerificationFileSchema.parse> | null> =>
  readJson(REVIEW_KEY, SeedVerificationFileSchema);

function print(summary: ReturnType<typeof summarise>): void {
  const line = (cells: readonly (string | number)[]): string =>
    cells.map((c, i) => String(c).padEnd(i === 0 ? 24 : 9)).join('');
  process.stdout.write(
    `${line(['case', 'entries', 'correct', 'wrong', 'unsure', 'blank', 'status'])}\n`,
  );
  for (const s of summary)
    process.stdout.write(
      `${line([s.case_id, s.entries, s.correct, s.wrong, s.unsure, s.blank, s.status])}\n`,
    );
}

async function verifySheet(args: readonly string[]): Promise<void> {
  if ((await blobs().read(SHEET_KEY)) !== null && !args.includes('--force'))
    throw new Error(
      `${SHEET_KEY} already exists and may hold edits not yet applied; run verify-apply first or pass --force`,
    );
  const only = (flag(args, '--case') ?? '').split(',').filter((s) => s !== '');
  const csv = buildSheet(await readTimelines(), await readReview(), only);
  await blobs().write(SHEET_KEY, csv, { contentType: 'text/csv' });
  log.info('review sheet written', { key: SHEET_KEY, rows: csv.split('\n').length - 2 });
}

async function verifyApply(args: readonly string[]): Promise<void> {
  const blob = await blobs().read(SHEET_KEY);
  if (blob === null) throw new Error(`${SHEET_KEY} not found; run verify-sheet first`);
  const timelines = await readTimelines();
  const result = applySheet(
    parseSheet(blob.data.toString('utf8')),
    timelines,
    await readReview(),
    flag(args, '--reviewer') ?? '',
    istToday(),
  );
  if (result.file === null) throw new Error(`Sheet not applied:\n  ${result.errors.join('\n  ')}`);
  await writeJson(REVIEW_KEY, result.file);
  print(summarise(timelines, result.file));
}

async function candidates(args: readonly string[]): Promise<void> {
  const { settings, json } = parseCandidateArgs(args);
  const [timelines, review, population] = await Promise.all([
    readTimelines(),
    readReview(),
    loadPopulation(settings),
  ]);
  const seeds = seedCases(
    timelines,
    review,
    population.statusByDocument,
    population.asOf,
    settings,
  );
  const result = mineCandidates(seeds, population.timelines, settings);
  process.stdout.write(
    json
      ? `${JSON.stringify(result.candidates, null, 2)}\n`
      : `${formatCandidates(result, { populationUndated: population.undated, asOf: population.asOf, settings })}\n`,
  );
}

/** The agent over the real timelines, printed only: proposals reach Firestore only from the cloud job. */
async function propose(args: readonly string[]): Promise<void> {
  const cfg = readAiConfig();
  if (cfg.provider !== 'mock' && !args.includes('--allow-billed'))
    throw new Error(
      `FUNDTRACE_AI_PROVIDER=${cfg.provider} is billed; pass --allow-billed to call it (B-15)`,
    );
  const ctx = await loadMinerContext(DEFAULT_MINER_SETTINGS);
  const model = modelFor(cfg, () => scriptedReview(ctx.result));
  const limits = {
    maxToolCalls: cfg.miner.maxToolCalls,
    maxInputChars: cfg.maxInputChars,
    maxProposals: MAX_PATTERN_PROPOSALS,
  };
  const agent = await reviewCandidates(model, ctx, limits, new Set());
  const plan = planProposals(
    ctx.result,
    agent,
    { live: new Set(), open: new Set() },
    {
      runId: 'local',
      model: model.id,
      promptVersion: MINE_PROMPT_VERSION,
      inputHash: minerInputHash(ctx.result),
      now: new Date(),
      maxProposals: MAX_PATTERN_PROPOSALS,
    },
  );
  const report = {
    candidates: ctx.result.candidates.length,
    model: model.id,
    summary: agent.summary,
    rejected: Object.fromEntries(agent.rejected),
    skipped: plan.skipped,
    proposals: plan.proposals,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function main(args: readonly string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === 'verify-sheet') await verifySheet(rest);
  else if (command === 'verify-apply') await verifyApply(rest);
  else if (command === 'candidates') await candidates(rest);
  else if (command === 'propose') await propose(rest);
  else if (command === 'verify-status') print(summarise(await readTimelines(), await readReview()));
  else {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('miner tool failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
