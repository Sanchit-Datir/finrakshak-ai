import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceId } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { joinKey } from './storage/blobStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const EnvSchema = z
  .object({
    FINRAKSHAK_AI_DATA_DIR: z.string().min(1).optional(),
    FINRAKSHAK_AI_MIN_DELAY_MS: z.coerce.number().int().min(500).max(60_000).default(1_500),
    FINRAKSHAK_AI_MAX_DOCS_PER_SOURCE: z.coerce.number().int().min(0).max(100_000).default(1_500),
    /** `fs` (local disk, default) or `gcs` (Cloud Storage; needs the three bucket names). */
    FINRAKSHAK_AI_STORAGE: z.enum(['fs', 'gcs']).default('fs'),
    FINRAKSHAK_AI_RAW_BUCKET: z.string().min(3).optional(),
    FINRAKSHAK_AI_STATE_BUCKET: z.string().min(3).optional(),
    FINRAKSHAK_AI_PUBLISH_BUCKET: z.string().min(3).optional(),
    FINRAKSHAK_AI_PROJECT_ID: z.string().min(1).optional(),
    /** `true` (default) keeps SEBI to a 10-order sample; the cloud sets `false` for the full index. */
    FINRAKSHAK_AI_SEBI_SAMPLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** Cloud Storage API endpoint override, only for local emulators (never set in the cloud). */
    FINRAKSHAK_AI_GCS_ENDPOINT: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.FINRAKSHAK_AI_STORAGE !== 'gcs') return;
    for (const key of [
      'FINRAKSHAK_AI_RAW_BUCKET',
      'FINRAKSHAK_AI_STATE_BUCKET',
      'FINRAKSHAK_AI_PUBLISH_BUCKET',
    ] as const)
      if (env[key] === undefined)
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required for gcs` });
  });

export type StorageConfig =
  | { readonly kind: 'fs' }
  | {
      readonly kind: 'gcs';
      readonly buckets: { readonly raw: string; readonly state: string; readonly publish: string };
      readonly projectId?: string;
      readonly endpoint?: string;
    };

export interface IngestConfig {
  readonly dataDir: string;
  readonly storage: StorageConfig;
  readonly userAgent: string;
  readonly minDelayMs: number;
  readonly maxDocsPerSource: number;
  readonly requestTimeoutMs: number;
  readonly maxRetries: number;
  readonly extractorVersion: string;
  readonly sebiSample: boolean;
}

let cached: IngestConfig | undefined;

function storageConfig(env: z.infer<typeof EnvSchema>): StorageConfig {
  if (env.FINRAKSHAK_AI_STORAGE === 'fs') return { kind: 'fs' };
  const buckets = {
    raw: env.FINRAKSHAK_AI_RAW_BUCKET ?? '',
    state: env.FINRAKSHAK_AI_STATE_BUCKET ?? '',
    publish: env.FINRAKSHAK_AI_PUBLISH_BUCKET ?? '',
  };
  return {
    kind: 'gcs',
    buckets,
    ...(env.FINRAKSHAK_AI_PROJECT_ID === undefined
      ? {}
      : { projectId: env.FINRAKSHAK_AI_PROJECT_ID }),
    ...(env.FINRAKSHAK_AI_GCS_ENDPOINT === undefined
      ? {}
      : { endpoint: env.FINRAKSHAK_AI_GCS_ENDPOINT }),
  };
}

/** Reads and validates the environment once (CLAUDE.md: env is parsed, not cast). */
export function getConfig(): IngestConfig {
  if (cached) return cached;
  const env = EnvSchema.parse(process.env);
  cached = {
    dataDir: env.FINRAKSHAK_AI_DATA_DIR ?? path.resolve(here, '../../data'),
    storage: storageConfig(env),
    userAgent:
      'Mozilla/5.0 (compatible; FinRakshakAIResearchBot/0.1; +https://github.com/Sanchit-Datir/finrakshak-ai)',
    minDelayMs: env.FINRAKSHAK_AI_MIN_DELAY_MS,
    maxDocsPerSource: env.FINRAKSHAK_AI_MAX_DOCS_PER_SOURCE,
    requestTimeoutMs: 90_000,
    maxRetries: 4,
    extractorVersion: 'regex-v1',
    sebiSample: env.FINRAKSHAK_AI_SEBI_SAMPLE,
  };
  return cached;
}

const SEBI_SAMPLE = 10;

/**
 * Per-source listing cap. SEBI keeps a 10-order sample unless `FINRAKSHAK_AI_SEBI_SAMPLE=false`
 * (the cloud lists the full ~24.5k-order index, incrementally after the first run).
 */
export function sourceItemCap(id: SourceId): number | undefined {
  return id === 'sebi' && getConfig().sebiSample ? SEBI_SAMPLE : undefined;
}

/** Per-source document cap per run (the sample's own cap; otherwise `FINRAKSHAK_AI_MAX_DOCS_PER_SOURCE`). */
export function sourceDocCap(id: SourceId): number {
  return id === 'sebi' && getConfig().sebiSample ? SEBI_SAMPLE : getConfig().maxDocsPerSource;
}

/** Slower per-host pacing where a source asks for it (IBBI rate-limits faster crawls, B-35). */
export const SOURCE_MIN_DELAY_MS: Readonly<Partial<Record<SourceId, number>>> = { ibbi: 2_500 };

/** Storage key under the data root (same on disk and in Cloud Storage), e.g. `interim/state/ed.json`. */
export function dataKey(...parts: string[]): string {
  return joinKey(...parts);
}

/** Absolute local path under the data folder (local tools and tests only; never in the cloud). */
export function dataPath(...parts: string[]): string {
  return path.join(getConfig().dataDir, ...parts);
}
