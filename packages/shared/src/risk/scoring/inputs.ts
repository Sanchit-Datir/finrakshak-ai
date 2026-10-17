import { EVIDENCE_STATUSES } from '../../evidence/graph.js';
import type { RuleEntity, RuleTransaction } from '../rules/types.js';
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

/** The link type for "this borrower paid, or was paid by, that entity". Derived, never documented. */
export const TRADING_LINK_TYPE = 'trades_with';

/**
 * Links from each borrower to the owners of the accounts it traded with, worked out from the payments
 * (customers it was paid by, suppliers it paid). They are `inferred`: a payment shows contact, not a
 * documented relationship, so the graph layer counts them at half. Payments to and from the lender
 * (`disbursement`, `repayment`) are not trade. Sorted and de-duplicated, so a re-run gives the same links.
 */
export function deriveTradingLinks(
  loans: readonly { readonly borrowerId: string; readonly accountEntityId: string }[],
  txns: readonly RuleTransaction[],
  entities: readonly RuleEntity[],
): ScoringLink[] {
  const borrowerOf = new Map(loans.map((l) => [l.accountEntityId, l.borrowerId]));
  const ownerOf = new Map(entities.map((e) => [e.id, e.ownerId ?? e.id]));
  const pairs = new Set<string>();
  for (const t of txns) {
    if (t.type === 'disbursement' || t.type === 'repayment') continue;
    for (const [mine, other] of [
      [t.fromId, t.toId],
      [t.toId, t.fromId],
    ] as const) {
      const borrower = borrowerOf.get(mine);
      const owner = ownerOf.get(other) ?? other;
      if (borrower !== undefined && owner !== borrower) pairs.add(`${borrower}\u0000${owner}`);
    }
  }
  return [...pairs].sort().map((pair) => {
    const [from = '', to = ''] = pair.split('\u0000');
    return { from, to, type: TRADING_LINK_TYPE, status: 'inferred' };
  });
}
