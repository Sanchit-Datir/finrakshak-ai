import {
  excludedEntryKeys,
  entryKey,
  timelineFromEvents,
  type EvidenceStatus,
  type RawTimelineEvent,
  type SeedVerificationFile,
  type SubjectTimeline,
  type TimelineEvent,
} from '@finrakshak-ai/shared';
import type { MinerSettings } from './settings.js';
import type { CaseTimeline } from './timelines.js';

/** A seed case ready for mining: its ordered events and the first insolvency or liquidation record. */
export interface SeedCase {
  readonly case_id: string;
  readonly timeline: SubjectTimeline;
  /** The outcome the miner looks for precursors of; null when the case has no such record. */
  readonly firstOutcome: TimelineEvent | null;
}

/** How firmly a status is established, weakest first (B-36). */
const STRENGTH: Readonly<Record<EvidenceStatus, number>> = {
  inference: 0,
  allegation: 1,
  fact: 2,
  finding: 3,
};

/** The weaker of two statuses, so combining records never upgrades what they say (B-36). */
export const weakerStatus = (a: EvidenceStatus, b: EvidenceStatus): EvidenceStatus =>
  STRENGTH[a] <= STRENGTH[b] ? a : b;

const OUTCOME_KINDS = new Set(['insolvency', 'liquidation']);
export const isOutcome = (e: TimelineEvent): boolean =>
  e.kind !== null && OUTCOME_KINDS.has(e.kind);

/** The first insolvency or liquidation record of a timeline (events are in date order). */
export const firstOutcomeOf = (events: readonly TimelineEvent[]): TimelineEvent | null =>
  events.find(isOutcome) ?? null;

/**
 * Seed cases as timelines. Entries the owner marked wrong are left out; the same document linked twice is
 * one event; entries without a real date are left out because they cannot be ordered. `statusOf` gives the
 * evidence status of a document where it is known.
 */
export function seedCases(
  timelines: readonly CaseTimeline[],
  review: SeedVerificationFile | null,
  statusOf: ReadonlyMap<string, EvidenceStatus>,
  asOf: string,
  settings: Pick<MinerSettings, 'earliestRealDate'>,
): SeedCase[] {
  const excluded = review === null ? new Map<string, Set<string>>() : excludedEntryKeys(review);
  return timelines.map((t) => {
    const wrong = excluded.get(t.case_id) ?? new Set<string>();
    const raw: RawTimelineEvent[] = t.entries
      .filter((e) => !wrong.has(entryKey(e)))
      .map((e) => ({
        event_id: entryKey(e),
        date: e.date !== null && e.date >= settings.earliestRealDate ? e.date : null,
        case_type: e.case_type,
        source_id: e.source_id,
        evidence_status: statusOf.get(e.document_id) ?? null,
      }));
    const timeline = timelineFromEvents(t.case_id, raw, asOf);
    return { case_id: t.case_id, timeline, firstOutcome: firstOutcomeOf(timeline.events) };
  });
}
