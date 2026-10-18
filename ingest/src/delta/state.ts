import { SourceIdSchema, type SourceId } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { dataKey } from '../config.js';
import { readJson, writeJson } from '../store/jsonl.js';

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

export const stateKey = (s: SourceId): string => dataKey('interim', 'state', `${s}.json`);

export async function readState(source: SourceId): Promise<SourceState | null> {
  try {
    return await readJson(stateKey(source), SourceStateSchema);
  } catch (e) {
    throw new Error(`Invalid ingest state for ${source}`, { cause: e });
  }
}

export async function writeState(state: SourceState): Promise<void> {
  await writeJson(stateKey(state.source_id), SourceStateSchema.parse(state));
}
