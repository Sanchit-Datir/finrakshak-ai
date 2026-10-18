import { z } from 'zod';

const IsoDay = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

const Schema = z.object({
  in: z.string().min(1),
  out: z.string().min(1),
  /** `code` for the hand-written library, or a library file path. */
  patterns: z.string().min(1),
  seedReview: z.string().min(1),
  dataBuiltOn: IsoDay.nullable(),
  withinMonths: z.number().int().min(0).max(12),
  /** A published settings version, `v1` or `v2`. */
  settings: z.string().regex(/^v\d+$/),
});
export type ScoreCliArgs = z.infer<typeof Schema>;

export const USAGE = `Usage: node ingest/dist/risk/scoreCli.js [--in DIR] [--out DIR] [--patterns code|FILE] [--seed-review FILE] [--data-built-on YYYY-MM-DD] [--settings v1|v2] [--within-months N]
  --in             synthetic data folder (default data/synthetic; run npm run synth first)
  --out            where scores.jsonl and score_report.json go (default: the --in folder), never data/raw, data/processed or data/registry
  --patterns       "code" for the hand-written version 1 library (default), or a library file
                   (default from FINRAKSHAK_AI_PATTERN_LIBRARY when set)
  --seed-review    the owner's seed review (default data/verification/seed_review.json; a missing file is allowed)
  --data-built-on  pretend the public data was built on this IST day (shows B-56 stale handling);
                   by default each replayed month has fresh data
  --settings       a published settings version (default v2; v1 is kept readable)
  --within-months  how many months after onset an alert still counts as on time (default 2)`;

const value = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Reads the command line with zod; a bad value throws with a readable message. */
export function parseArgs(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ScoreCliArgs {
  const input = value(args, '--in') ?? 'data/synthetic';
  const within = value(args, '--within-months');
  const parsed = Schema.safeParse({
    in: input,
    out: value(args, '--out') ?? input,
    patterns: value(args, '--patterns') ?? env['FINRAKSHAK_AI_PATTERN_LIBRARY'] ?? 'code',
    seedReview: value(args, '--seed-review') ?? 'data/verification/seed_review.json',
    dataBuiltOn: value(args, '--data-built-on') ?? null,
    withinMonths: within === undefined ? 2 : Number(within),
    settings: value(args, '--settings') ?? 'v2',
  });
  if (!parsed.success)
    throw new Error(
      `Bad options: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return parsed.data;
}
