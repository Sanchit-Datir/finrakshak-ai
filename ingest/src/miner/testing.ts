import {
  timelineFromEvents,
  type RawTimelineEvent,
  type SubjectTimeline,
} from '@fund-tracker/shared';
import { firstOutcomeOf, type SeedCase } from './seedTimelines.js';

/** Builders for the miner's tests. Every id and date is invented. */

export const AS_OF = '2030-01-01';

const SOURCE: Readonly<Record<string, string>> = {
  ed_search_seizure: 'ed',
  ed_arrest: 'ed',
  ed_provisional_attachment: 'ed',
  ibbi_cirp: 'ibbi',
  ibbi_liquidation: 'ibbi',
  nfra_inspection_report: 'nfra',
  rbi_monetary_penalty: 'rbi',
};

export const rawEvent = (
  id: string,
  date: string,
  caseType: string,
  status: string | null = 'fact',
): RawTimelineEvent => ({
  event_id: id,
  date,
  case_type: caseType,
  source_id: SOURCE[caseType] ?? 'ed',
  evidence_status: status,
});

export const timeline = (subject: string, events: readonly RawTimelineEvent[]): SubjectTimeline =>
  timelineFromEvents(subject, events, AS_OF);

export function seed(caseId: string, events: readonly RawTimelineEvent[]): SeedCase {
  const t = timeline(caseId, events);
  return { case_id: caseId, timeline: t, firstOutcome: firstOutcomeOf(t.events) };
}

/** `count` entities, each with the events `make(i)` returns, named `<prefix>-<i>`. */
export const crowd = (
  prefix: string,
  count: number,
  make: (i: number) => RawTimelineEvent[],
): SubjectTimeline[] =>
  Array.from({ length: count }, (_, i) =>
    timeline(`${prefix}-${String(i).padStart(3, '0')}`, make(i)),
  );
