import { z } from 'zod';

export const MAX_CUSTOMERS = 5_000;

const Schema = z.object({
  seed: z.number().int().nonnegative(),
  customers: z.number().int().min(1).max(MAX_CUSTOMERS),
  months: z.number().int().min(12).max(36),
  out: z.string().min(1),
  sample: z.boolean(),
});
export type SynthCliArgs = z.infer<typeof Schema>;

export const DEFAULT_SEED = 20261017;
export const USAGE = `Usage: node ingest/dist/synthCli.js [--seed N] [--customers N] [--months N] [--out DIR] [--sample]
  --seed       whole number >= 0 (default ${DEFAULT_SEED})
  --customers  1 to ${MAX_CUSTOMERS} (default 200), shared out across the scenarios in the plan's proportions
  --months     12 to 36 (default 24)
  --out        folder under the repository, never data/raw, data/processed or data/registry (default data/synthetic)
  --sample     write the small contract sample used by the web tests instead`;

const value = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const num = (text: string | undefined, fallback: number): number =>
  text === undefined ? fallback : Number(text);

/** Reads the command line with zod; a bad value throws with a readable message. */
export function parseArgs(args: readonly string[]): SynthCliArgs {
  const parsed = Schema.safeParse({
    seed: num(value(args, '--seed'), DEFAULT_SEED),
    customers: num(value(args, '--customers'), 200),
    months: num(value(args, '--months'), 24),
    out: value(args, '--out') ?? 'data/synthetic',
    sample: args.includes('--sample'),
  });
  if (!parsed.success)
    throw new Error(
      `Bad options: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return parsed.data;
}
