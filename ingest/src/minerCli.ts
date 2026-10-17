#!/usr/bin/env node
import { SeedVerificationFileSchema } from '@fund-tracker/shared';
import { dataKey } from './config.js';
import { errorMessage, log } from './log.js';
import { applySheet, buildSheet, parseSheet, summarise } from './miner/review.js';
import { readTimelines } from './miner/timelines.js';
import { istToday } from './miner/today.js';
import { blobs } from './storage/index.js';
import { readJson, writeJson } from './store/jsonl.js';

/**
 * Pattern miner tools (docs/plans/PATTERN_MINER_PLAN.md). So far: the seed verification sheet. It reads
 * data/processed and writes only data/verification/ (new files; the processed data is never changed).
 */

const SHEET_KEY = dataKey('verification', 'seed_review_sheet.csv');
const REVIEW_KEY = dataKey('verification', 'seed_review.json');

const USAGE = `Usage: node ingest/dist/minerCli.js <command>
  verify-sheet [--case id,id] [--force]   write the review sheet (data/verification/seed_review_sheet.csv)
  verify-apply --reviewer NAME            read the filled sheet and save the decisions (seed_review.json)
  verify-status                           show how far the review has got`;

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

async function main(args: readonly string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === 'verify-sheet') await verifySheet(rest);
  else if (command === 'verify-apply') await verifyApply(rest);
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
