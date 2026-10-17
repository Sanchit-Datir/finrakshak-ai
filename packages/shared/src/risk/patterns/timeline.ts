import { z } from 'zod';
import { IsoDateSchema } from '../../evidence/documents.js';
import { EVIDENCE_STATUSES } from '../../evidence/graph.js';
import { RECORD_KINDS, recordKindOf } from '../recordKinds.js';
import { PatternIdSchema, type PatternDefinition } from './schema.js';

/**
 * What the matcher reads and returns (docs/plans/PATTERN_CONTRACT.md, section 6). The miner builds a
 * `SubjectTimeline` from the case timelines and the scorer builds one from the public tables, both
 * through `timelineFromEvents`, so a pattern behaves the same when it is proposed, backtested and scored.
 */

const KindOrNull = z.enum(RECORD_KINDS).nullable();

export const TimelineEventSchema = z.object({
  event_id: z.string().min(1),
  /** IST calendar date. */
  date: IsoDateSchema,
  /** As in the public tables, e.g. `ed_search_seizure`. */
  case_type: z.string().min(1),
  /** From `recordKindOf(case_type)`; null when the case type is not a record for the risk check. */
  kind: KindOrNull,
  source_id: z.string().min(1),
  evidence_status: z.enum([...EVIDENCE_STATUSES, 'unknown']),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const SubjectTimelineSchema = z
  .object({
    subject_id: z.string().min(1),
    /** Events after this date are not in `events`, so a replay can never see the future. */
    as_of: IsoDateSchema,
    events: z.array(TimelineEventSchema),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.events.forEach((e, i) => {
      const prev = t.events[i - 1];
      if (
        prev !== undefined &&
        (e.date < prev.date || (e.date === prev.date && e.event_id <= prev.event_id))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['events', i],
          message: 'events must be sorted by date, then event_id, with no duplicates',
        });
      if (e.date > t.as_of)
        ctx.addIssue({ code: 'custom', path: ['events', i], message: 'event is after as_of' });
      if (seen.has(e.event_id))
        ctx.addIssue({ code: 'custom', path: ['events', i], message: 'duplicate event_id' });
      seen.add(e.event_id);
    });
  });
export type SubjectTimeline = z.infer<typeof SubjectTimelineSchema>;

/** A flagged entity near the subject in the documented relationship graph. */
export const FlaggedNeighbourSchema = z.object({
  entity_id: z.string().min(1),
  hops: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  link_status: z.enum(['verified', 'user_provided', 'inferred']),
  kinds: z.array(z.enum(RECORD_KINDS)),
  is_hub: z.boolean(),
});
export type FlaggedNeighbour = z.infer<typeof FlaggedNeighbourSchema>;

export const MatchResultSchema = z.object({
  pattern_id: PatternIdSchema,
  /** 0..1; 1 only for a full match. */
  strength: z.number().min(0).max(1),
  matched_event_ids: z.array(z.string()),
  matched_neighbour_ids: z.array(z.string()),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

/**
 * The matcher contract. Pure and deterministic; never reads a clock; an event after `as_of` can never
 * change the result; returns null for no match; returns null (never throws) for a template it does not
 * handle, and always for `transaction_typology`, which the scorer maps from a fired monitoring rule.
 */
export type PatternMatcher = (
  pattern: { readonly pattern_id: string; readonly definition: PatternDefinition },
  timeline: SubjectTimeline,
  neighbours: readonly FlaggedNeighbour[],
) => MatchResult | null;

export interface RawTimelineEvent {
  readonly event_id: string;
  /** Null or empty for an undated record; such events are left out (they cannot be ordered). */
  readonly date: string | null;
  readonly case_type: string;
  readonly source_id: string;
  readonly evidence_status?: string | null;
}

type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
const isEvidenceStatus = (s: string): s is EvidenceStatus => EVIDENCE_STATUSES.some((v) => v === s);

/**
 * Builds the ordered, replay-safe timeline of one subject: drops undated events and events after
 * `asOf`, keeps the first of any repeated event_id, looks up each record kind, sorts by date then
 * event_id, and maps an unrecognised evidence status to `unknown` (never upgrading it).
 */
export function timelineFromEvents(
  subjectId: string,
  events: readonly RawTimelineEvent[],
  asOf: string,
): SubjectTimeline {
  const seen = new Set<string>();
  const kept: TimelineEvent[] = [];
  for (const e of events) {
    if (e.date === null || e.date === '' || e.date > asOf || seen.has(e.event_id)) continue;
    seen.add(e.event_id);
    const status = e.evidence_status ?? '';
    kept.push({
      event_id: e.event_id,
      date: e.date,
      case_type: e.case_type,
      kind: recordKindOf(e.case_type) ?? null,
      source_id: e.source_id,
      evidence_status: isEvidenceStatus(status) ? status : 'unknown',
    });
  }
  kept.sort((a, b) => a.date.localeCompare(b.date) || a.event_id.localeCompare(b.event_id));
  return { subject_id: subjectId, as_of: asOf, events: kept };
}
