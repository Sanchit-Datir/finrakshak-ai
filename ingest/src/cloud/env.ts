import { SourceIdSchema, type SourceId } from '@finrakshak-ai/shared';
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
  FINRAKSHAK_AI_RUN_ID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .optional(),
  FINRAKSHAK_AI_RUN_AT: z.string().datetime().optional(),
  /** Set by Cloud Run for each task of a job execution. */
  CLOUD_RUN_TASK_INDEX: z.coerce.number().int().nonnegative().default(0),
  CLOUD_RUN_TASK_COUNT: z.coerce.number().int().positive().default(1),
  CLOUD_RUN_EXECUTION: z.string().optional(),
  FINRAKSHAK_AI_SOURCES: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined ? [...AUTOMATED_SOURCES] : v.split(',').map((s) => s.trim()),
    )
    .pipe(z.array(SourceIdSchema).min(1)),
  FINRAKSHAK_AI_SOURCE_FLAGS: jsonString(z.record(SourceIdSchema, SourceFlagsSchema)),
  /** `file` (one machine) or `firestore` (cloud: parallel tasks and overlapping runs). */
  FINRAKSHAK_AI_COORDINATION: z.enum(['file', 'firestore']).default('file'),
  FINRAKSHAK_AI_LEASE_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(400),
  /** False = dry run: bundles go to the `dry-run` channel, BigQuery to `<dataset>_dryrun`. */
  FINRAKSHAK_AI_PUBLISH_ENABLED: boolString,
  FINRAKSHAK_AI_FORCE_BUILD: boolString,
  FINRAKSHAK_AI_PUBLISH_KEEP: z.coerce.number().int().min(2).max(100).default(14),
  /** Largest allowed drop in any table's row count against the published build. */
  FINRAKSHAK_AI_GATE_MAX_DROP: z.coerce.number().min(0).max(1).default(0.2),
  FINRAKSHAK_AI_BIGQUERY_DATASET: z
    .string()
    .regex(/^\w{1,1024}$/)
    .optional(),
  FINRAKSHAK_AI_BIGQUERY_LOCATION: z.string().default('asia-south1'),
  /** 1 = first review of a run; 2 = after the automatic re-run (no further automatic re-runs). */
  FINRAKSHAK_AI_AGENT_PASS: z.coerce.number().int().min(1).max(2).default(1),
  /** The synthetic risk-scoring step (REMAINING_WORK.md, W2d); off by default. */
  FINRAKSHAK_AI_SCORE_ENABLED: boolString,
  /** Synthetic dataset the scorer reads; must end in `_synth` (B-54). Never suffixed `_dryrun`. */
  FINRAKSHAK_AI_SYNTH_DATASET: z
    .string()
    .regex(/^\w{1,1000}_synth$/, 'must end in _synth (B-54)')
    .default('fundtrace_synth'),
  /** A published scoring settings version. */
  FINRAKSHAK_AI_SCORE_SETTINGS: z
    .string()
    .regex(/^v\d+$/)
    .default('v2'),
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
  readonly score: {
    readonly enabled: boolean;
    readonly dataset: string;
    readonly settings: string;
  };
}

/** Parses the job environment once; fails fast with the field that is wrong. */
export function readCloudEnv(source: NodeJS.ProcessEnv = process.env): CloudEnv {
  const env = CloudEnvSchema.parse(source);
  const runAt = env.FINRAKSHAK_AI_RUN_AT ?? new Date().toISOString();
  const dataset = env.FINRAKSHAK_AI_BIGQUERY_DATASET;
  return {
    runId: env.FINRAKSHAK_AI_RUN_ID ?? env.CLOUD_RUN_EXECUTION ?? `run_${stamp(runAt)}`,
    runAt,
    taskIndex: env.CLOUD_RUN_TASK_INDEX,
    taskCount: env.CLOUD_RUN_TASK_COUNT,
    sources: env.FINRAKSHAK_AI_SOURCES,
    sourceFlags: env.FINRAKSHAK_AI_SOURCE_FLAGS,
    coordination: env.FINRAKSHAK_AI_COORDINATION,
    leaseTtlMs: env.FINRAKSHAK_AI_LEASE_TTL_MINUTES * 60_000,
    publishEnabled: env.FINRAKSHAK_AI_PUBLISH_ENABLED,
    forceBuild: env.FINRAKSHAK_AI_FORCE_BUILD,
    publishKeep: env.FINRAKSHAK_AI_PUBLISH_KEEP,
    gateMaxDrop: env.FINRAKSHAK_AI_GATE_MAX_DROP,
    bigquery:
      dataset === undefined
        ? null
        : {
            // A dry run never touches the production tables.
            dataset: env.FINRAKSHAK_AI_PUBLISH_ENABLED ? dataset : `${dataset}_dryrun`,
            location: env.FINRAKSHAK_AI_BIGQUERY_LOCATION,
          },
    agentPass: env.FINRAKSHAK_AI_AGENT_PASS === 2 ? 2 : 1,
    score: {
      enabled: env.FINRAKSHAK_AI_SCORE_ENABLED,
      dataset: env.FINRAKSHAK_AI_SYNTH_DATASET,
      settings: env.FINRAKSHAK_AI_SCORE_SETTINGS,
    },
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
