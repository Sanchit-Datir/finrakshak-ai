import {
  CaseEventSchema,
  RelationshipSchema,
  timelineFromEvents,
  type CaseEvent,
  type EvidenceStatus,
  type RawTimelineEvent,
  type Relationship,
  type SubjectTimeline,
} from '@fund-tracker/shared';
import { dataKey } from '../config.js';
import { readJsonl } from '../store/jsonl.js';
import { weakerStatus } from './seedTimelines.js';
import type { MinerSettings } from './settings.js';

/**
 * The baseline population (B-63): every entity named in a proceeding in the public tables, with the
 * records it is named in. It includes the seed cases' own entities, so it is a comparison group, not a
 * clean control.
 */
export interface Population {
  readonly timelines: SubjectTimeline[];
  /** Weakest evidence status seen for each document, from the named-in links. */
  readonly statusByDocument: Map<string, EvidenceStatus>;
  /** Latest date in the data: used as `as_of` for every timeline. */
  readonly asOf: string;
  /** Named-in links whose record has no usable date, left out. */
  readonly undated: number;
}

export function buildPopulation(
  events: readonly CaseEvent[],
  relationships: readonly Relationship[],
  settings: Pick<MinerSettings, 'earliestRealDate'>,
): Population {
  const eventById = new Map(events.map((e) => [e.event_id, e]));
  const perEntity = new Map<string, RawTimelineEvent[]>();
  const statusByDocument = new Map<string, EvidenceStatus>();
  let undated = 0;
  let asOf = settings.earliestRealDate;
  for (const r of relationships) {
    if (r.relationship_type !== 'NAMED_IN_PROCEEDING') continue;
    const prior = statusByDocument.get(r.document_id);
    statusByDocument.set(
      r.document_id,
      prior === undefined ? r.evidence_status : weakerStatus(prior, r.evidence_status),
    );
    const e = eventById.get(r.to_id);
    const date = e === undefined ? null : (e.event_date ?? e.publication_date);
    if (e === undefined || date === null || date < settings.earliestRealDate) {
      undated++;
      continue;
    }
    if (date > asOf) asOf = date;
    const list = perEntity.get(r.from_id) ?? [];
    list.push({
      event_id: e.event_id,
      date,
      case_type: e.case_type,
      source_id: e.source_id,
      evidence_status: r.evidence_status,
    });
    perEntity.set(r.from_id, list);
  }
  const timelines = [...perEntity.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, list]) => timelineFromEvents(id, list, asOf))
    .filter((t) => t.events.length > 0);
  return { timelines, statusByDocument, asOf, undated };
}

/** Reads the published case events and relationships and builds the population. */
export async function loadPopulation(
  settings: Pick<MinerSettings, 'earliestRealDate'>,
): Promise<Population> {
  const [events, relationships] = await Promise.all([
    readJsonl(dataKey('processed', 'case_events.jsonl'), CaseEventSchema),
    readJsonl(dataKey('processed', 'relationships.jsonl'), RelationshipSchema),
  ]);
  return buildPopulation(events, relationships, settings);
}
