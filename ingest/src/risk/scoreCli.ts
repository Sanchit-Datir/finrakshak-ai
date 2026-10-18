#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  settingsForVersion,
  SynthTruthSchema,
  matchPattern,
  type SynthTruth,
} from '@finrakshak-ai/shared';
import { errorMessage, log } from '../log.js';
import { assertSafeOutputDir } from '../synth/guards.js';
import { USAGE, parseArgs } from './cliArgs.js';
import { evaluate, type EvaluationReport } from './evaluate.js';
import { fileScoringInputs } from './fileInputs.js';
import { codePatterns, filePatterns, loadLibrary } from './patternSources.js';
import { monthsFrom, replay, type ReplayResult } from './replay.js';

/**
 * Local scoring run (RISK_SCORING_PLAN.md, "Local CLI"): replays the synthetic data month by month with
 * the same pure core the cloud job will use, then compares the result with the truth labels. SYNTH data
 * only (B-54); no model is called (B-15); scores are leads for a reviewer, never verdicts (B-58).
 */

function readTruth(dir: string): SynthTruth[] {
  const file = path.join(dir, 'truth.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l, i) => {
      const parsed = SynthTruthSchema.safeParse(JSON.parse(l));
      if (!parsed.success) throw new Error(`truth.jsonl line ${i + 1} is not a truth row`);
      return parsed.data;
    });
}

function write(
  dir: string,
  result: ReplayResult,
  report: EvaluationReport | null,
  extra: Record<string, unknown>,
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'scores.jsonl'),
    result.rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
  const body = { ...extra, findings: result.findings, evaluation: report };
  writeFileSync(path.join(dir, 'score_report.json'), `${JSON.stringify(body, null, 2)}\n`);
}

function summary(report: EvaluationReport | null, result: ReplayResult): string {
  if (report === null)
    return `scored ${result.rows.length} loan-months; no truth.jsonl, so no evaluation`;
  const lines = [
    `SYNTH replay: ${report.loans} loans, ${report.months} months, ${report.alerts} alerts (${report.alerts_per_1000_loans_per_month} per 1,000 loan-months)`,
    ...Object.entries(report.by_archetype).map(
      ([a, s]) =>
        `  ${a.padEnd(20)} loans ${s.loans}, alerted ${s.loans_alerted}, on time ${s.alerted_in_window}, band agreement ${s.band_agreement_percent}%, expected reasons found ${s.expected_reasons_found_percent ?? '-'}%`,
    ),
    `  rules: ${report.rules.found}/${report.rules.expected} expected found, ${report.rules.unexpected.length} unexpected`,
    `  controls alerted: ${report.controls_alerted.length}; defaulters missed: ${report.defaulters_missed.length}`,
    `  findings: ${result.findings.map((f) => f.code).join(', ') || 'none'}`,
  ];
  return lines.join('\n');
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.includes('--help')) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const args = parseArgs(argv, process.env);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const inDir = path.resolve(repoRoot, args.in);
  const outDir = assertSafeOutputDir(args.out, repoRoot);
  const loaded = await fileScoringInputs({
    dir: inDir,
    seedReviewFile: path.resolve(repoRoot, args.seedReview),
  }).load();
  const data = { ...loaded, dataBuiltOn: args.dataBuiltOn };
  if (data.period === null) throw new Error(`manifest.json is missing or invalid in ${inDir}`);
  const source =
    args.patterns === 'code' ? codePatterns() : filePatterns(path.resolve(repoRoot, args.patterns));
  const library = await loadLibrary(source);
  const settings = settingsForVersion(args.settings);
  if (settings === undefined) throw new Error(`Unknown settings version: ${args.settings}`);
  const result = replay(data, {
    months: monthsFrom(data.period.startMonth, data.period.months),
    settings,
    library,
    matcher: matchPattern,
  });
  const truth = readTruth(inDir);
  const report = truth.length === 0 ? null : evaluate(result.rows, truth, args.withinMonths);
  write(outDir, result, report, {
    synthetic: true,
    settings_version: settings.settings_version,
    pattern_version: library.library?.libraryVersion ?? null,
    patterns: args.patterns,
    unmatched_records: data.unmatchedRecords,
  });
  process.stdout.write(`${summary(report, result)}\n`);
  log.info('scores written', { dir: outDir, rows: result.rows.length });
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('scoring failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
