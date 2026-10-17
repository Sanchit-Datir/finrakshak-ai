import { EVIDENCE_STATUSES } from '../../evidence/graph.js';
import type { ReasonEvidenceStatus } from './types.js';

/**
 * The plain shapes the scoring core reads. Like the monitoring rules, they are structural types: the
 * loader (a file, BigQuery) parses its rows with zod first and hands these over. Matching a public
 * record to an entity is the loader's job and is exact only (CIN, then exact normalised name; B-37).
 */

export interface PublicRecord {
  /** The public event id (`case_events.event_id`). */
  readonly record_id: string;
  /** The entity the record was matched to. */
  readonly entity_id: string;
  /** IST calendar date; null for an undated record, which the layers leave out. */
  readonly date: string | null;
  readonly case_type: string;
  readonly source_id: string;
  readonly evidence_status: string | null;
}

export interface ScoringLink {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  /** `verified`, `user_provided` or `inferred`. */
  readonly status: string;
}

/** Relationship types that make the `from` entity a director or owner of the `to` entity. */
export const RELATED_PARTY_TYPES: readonly string[] = ['director_of', 'owner_of'];

/** Directors and owners of a borrower, from documented links into it. */
export const relatedPartiesOf = (borrowerId: string, links: readonly ScoringLink[]): string[] =>
  [
    ...new Set(
      links
        .filter((l) => l.to === borrowerId && RELATED_PARTY_TYPES.includes(l.type))
        .map((l) => l.from),
    ),
  ].sort();

/** An unknown or missing status stays `unknown`; it is never upgraded (B-36). */
export const statusOf = (s: string | null): ReasonEvidenceStatus =>
  EVIDENCE_STATUSES.find((v) => v === s) ?? 'unknown';
