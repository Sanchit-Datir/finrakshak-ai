import { readFile } from 'node:fs/promises';
import { SourceIdSchema, type SourceId } from '@fund-tracker/shared';
import { z } from 'zod';
import { dataPath } from '../config.js';
import { isNotFound, writeJson } from '../store/jsonl.js';

/** Per-source watermark, written only after a listing succeeds. */
export const SourceStateSchema = z.object({
  source_id: SourceIdSchema,
  last_success_at: z.string().datetime(),
  last_full_listing_at: z.string().datetime().nullable(),
  item_count: z.number().int().nonnegative(),
  /** Items flagged as no longer listed; they stay in the listing. */
  missing_ids: z.array(z.string()),
});
export type SourceState = z.infer<typeof SourceStateSchema>;

export const stateFile = (s: SourceId): string => dataPath('interim', 'state', `${s}.json`);

export async function readState(source: SourceId): Promise<SourceState | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(stateFile(source), 'utf8'));
    return SourceStateSchema.parse(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw new Error(`Invalid ingest state for ${source}`, { cause: e });
  }
}

export async function writeState(state: SourceState): Promise<void> {
  await writeJson(stateFile(state.source_id), SourceStateSchema.parse(state));
}
