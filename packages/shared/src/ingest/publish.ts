import { z } from 'zod';
import { GraphLabIndexEntrySchema } from '../graphlab/schema.js';
import { GateResultSchema } from './runs.js';

/**
 * Pointer to the bundle the app serves (`publish/<channel>/current.json`). Replacing this one
 * object is the atomic publish step; repointing it to an older version is the rollback (B-50).
 */
export const PublishedVersionSchema = z.object({
  /** Folder under `versions/`, derived from `built_at`. */
  version: z.string().regex(/^[0-9TZ-]+$/),
  built_at: z.string().datetime(),
  published_at: z.string().datetime(),
  run_id: z.string().min(1),
  /** Bundle files, relative to the version folder. */
  files: z.array(GraphLabIndexEntrySchema).min(1),
  rows: z.record(z.string(), z.number().int().nonnegative()),
  /** Seed cases present in the real bundle; a later build may not drop one silently. */
  seed_cases: z.array(z.string()),
  bundle_bytes: z.number().int().nonnegative(),
  gates: z.array(GateResultSchema),
});
export type PublishedVersion = z.infer<typeof PublishedVersionSchema>;

export const PUBLISH_CHANNELS = ['live', 'dry-run'] as const;
export type PublishChannel = (typeof PUBLISH_CHANNELS)[number];
