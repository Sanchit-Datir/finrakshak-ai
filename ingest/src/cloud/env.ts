import { SourceIdSchema, type SourceId } from '@fund-tracker/shared';
import { z } from 'zod';
import { stamp } from '../delta/report.js';
import { AUTOMATED_SOURCES } from '../pipeline/adapters.js';

/** One-run overrides per source, set by Workflows from approved proposals (MVP 2). */
export const SourceFlagsSchema = z.object({
  forceFull: z.boolean().optional(),
  allowShrink: z.boolean().optional(),
  skip: z.boolean().optional(),
});
export type SourceFlags = z.infer<typeof SourceFlagsSchema>;

const boolString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const jsonString = <T extends z.ZodTypeAny>(
  schema: T,
): z.ZodType<z.infer<T>, z.ZodTypeDef, unknown> =>
  z
    .string()
    .default('{}')
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'not valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(schema);

const CloudEnvSchema = z.object({
  /** Shared by every job of one daily run; Workflows passes it. */
  FUNDTRACE_RUN_ID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
  FUNDTRACE_RUN_AT: z.string().datetime().optional(),
  /** Set by Cloud Run for each task of a job execution. */
  CLOUD_RUN_TASK_INDEX: z.coerce.number().int().nonnegative().default(0),
  CLOUD_RUN_TASK_COUNT: z.coerce.number().int().positive().default(1),
  CLOUD_RUN_EXECUTION: z.string().optional(),
  FUNDTRACE_SOURCES: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined ? [...AUTOMATED_SOURCES] : v.split(',').map((s) => s.trim()),
    )
    .pipe(z.array(SourceIdSchema).min(1)),
  FUNDTRACE_SOURCE_FLAGS: jsonString(z.record(SourceIdSchema, SourceFlagsSchema)),
  /** `file` (one machine) or `firestore` (cloud: parallel tasks and overlapping runs). */
  FUNDTRACE_COORDINATION: z.enum(['file', 'firestore']).default('file'),
  FUNDTRACE_LEASE_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(400),
  /** False = dry run: bundles go to the `dry-run` channel, BigQuery to `<dataset>_dryrun`. */
  FUNDTRACE_PUBLISH_ENABLED: boolString,
  FUNDTRACE_FORCE_BUILD: boolString,
  FUNDTRACE_PUBLISH_KEEP: z.coerce.number().int().min(2).max(100).default(14),
  /** Largest allowed drop in any table's row count against the published build. */
  FUNDTRACE_GATE_MAX_DROP: z.coerce.number().min(0).max(1).default(0.2),
  FUNDTRACE_BIGQUERY_DATASET: z
    .string()
    .regex(/^\w{1,1024}$/)
    .optional(),
  FUNDTRACE_BIGQUERY_LOCATION: z.string().default('asia-south1'),
  /** 1 = first review of a run; 2 = after the automatic re-run (no further automatic re-runs). */
  FUNDTRACE_AGENT_PASS: z.coerce.number().int().min(1).max(2).default(1),
});

export interface CloudEnv {
  readonly runId: string;
  readonly runAt: string;
  readonly taskIndex: number;
  readonly taskCount: number;
  readonly sources: readonly SourceId[];
  readonly sourceFlags: Readonly<Partial<Record<SourceId, SourceFlags>>>;
  readonly coordination: 'file' | 'firestore';
  readonly leaseTtlMs: number;
  readonly publishEnabled: boolean;
  readonly forceBuild: boolean;
  readonly publishKeep: number;
  readonly gateMaxDrop: number;
  readonly bigquery: { readonly dataset: string; readonly location: string } | null;
  readonly agentPass: 1 | 2;
}

/** Parses the job environment once; fails fast with the field that is wrong. */
export function readCloudEnv(source: NodeJS.ProcessEnv = process.env): CloudEnv {
  const env = CloudEnvSchema.parse(source);
  const runAt = env.FUNDTRACE_RUN_AT ?? new Date().toISOString();
  const dataset = env.FUNDTRACE_BIGQUERY_DATASET;
  return {
    runId: env.FUNDTRACE_RUN_ID ?? env.CLOUD_RUN_EXECUTION ?? `run_${stamp(runAt)}`,
    runAt,
    taskIndex: env.CLOUD_RUN_TASK_INDEX,
    taskCount: env.CLOUD_RUN_TASK_COUNT,
    sources: env.FUNDTRACE_SOURCES,
    sourceFlags: env.FUNDTRACE_SOURCE_FLAGS,
    coordination: env.FUNDTRACE_COORDINATION,
    leaseTtlMs: env.FUNDTRACE_LEASE_TTL_MINUTES * 60_000,
    publishEnabled: env.FUNDTRACE_PUBLISH_ENABLED,
    forceBuild: env.FUNDTRACE_FORCE_BUILD,
    publishKeep: env.FUNDTRACE_PUBLISH_KEEP,
    gateMaxDrop: env.FUNDTRACE_GATE_MAX_DROP,
    bigquery:
      dataset === undefined
        ? null
        : {
            // A dry run never touches the production tables.
            dataset: env.FUNDTRACE_PUBLISH_ENABLED ? dataset : `${dataset}_dryrun`,
            location: env.FUNDTRACE_BIGQUERY_LOCATION,
          },
    agentPass: env.FUNDTRACE_AGENT_PASS === 2 ? 2 : 1,
  };
}

/** Sources this task owns: round-robin, so any task count works with any number of sources. */
export function sourcesForTask(
  sources: readonly SourceId[],
  taskIndex: number,
  taskCount: number,
): SourceId[] {
  return sources.filter((_, i) => i % taskCount === taskIndex);
}
