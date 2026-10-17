import { z } from 'zod';
import { dataKey } from '../config.js';
import { readJson } from '../store/jsonl.js';

/** One linked official record of a seed case (built by `dataset/timelines.ts`). */
export const TimelineEntrySchema = z.object({
  date: z.string().nullable(),
  source_id: z.string(),
  case_type: z.string(),
  proceeding_status: z.string(),
  title: z.string(),
  url: z.string(),
  document_id: z.string().min(1),
  matched_alias: z.string(),
  matched_in: z.string(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const CaseTimelineSchema = z.object({
  case_id: z.string().regex(/^[a-z0-9_]+$/),
  display_name: z.string(),
  verification_status: z.string(),
  sources: z.array(z.string()),
  first_public_record: z.string().nullable(),
  entries: z.array(TimelineEntrySchema),
});
export type CaseTimeline = z.infer<typeof CaseTimelineSchema>;

export const TIMELINES_KEY = dataKey('processed', 'case_timelines.json');

/** The seed case timelines from the published build; throws a clear error when the build is missing. */
export async function readTimelines(): Promise<CaseTimeline[]> {
  const timelines = await readJson(TIMELINES_KEY, z.array(CaseTimelineSchema));
  if (timelines === null) throw new Error(`${TIMELINES_KEY} not found; run the build first`);
  return timelines;
}
