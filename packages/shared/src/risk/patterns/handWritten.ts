import type { MonitoringRuleId } from '../rules/types.js';
import type { Pattern, PatternDefinition, PatternLibrary } from './schema.js';

/**
 * Version 1 of the pattern library, written by hand (RISK_SCORING_PLAN.md MVP 4, build step 9) so scoring
 * does not wait for the miner. Every pattern is a `hand_written_hypothesis`, so it always scores with the
 * 0.6 support weight. It is read through `codePatterns` until step 15 moves the library to Firestore.
 * The ids and the content hash are fixed here because this package does not import Node's crypto; a
 * test recomputes both, and the library must pass `PatternLibrarySchema`.
 */

const APPROVED_AT = '2026-10-17T00:00:00.000Z';

const base = {
  schema_version: 1,
  version: 1,
  origin: 'hand_written',
  status: 'approved',
  support: {
    basis: 'hand_written_hypothesis',
    supporting_case_ids: [],
    supporting_case_count: 0,
    population: null,
    median_gap_months: null,
  },
  created_at: APPROVED_AT,
  approved_by: 'owner',
  approved_at: APPROVED_AT,
  retired_at: null,
  supersedes: null,
} as const satisfies Partial<Pattern>;

interface Spec {
  readonly pattern_id: string;
  readonly definition: PatternDefinition;
  readonly name: string;
  readonly description: string;
  readonly benign_explanations: string[];
  readonly evidence_statuses: Pattern['evidence_statuses'];
}

const make = (s: Spec): Pattern => ({
  ...base,
  support: { ...base.support, supporting_case_ids: [] },
  ...s,
});

const typology = (
  pattern_id: string,
  rule_id: MonitoringRuleId,
  name: string,
  description: string,
  benign: string,
): Pattern =>
  make({
    pattern_id,
    definition: { template: 'transaction_typology', rule_id },
    name,
    description,
    benign_explanations: [benign],
    evidence_statuses: ['fact'],
  });

/** Sorted by pattern_id, as the library schema requires. */
const PATTERNS: Pattern[] = [
  typology(
    'pat_199b81efa268717f',
    'linked_counterparty',
    'Loan money paid to a linked party',
    'Money from the loan account goes to an entity linked to the borrower by a director, owner, guarantor or shared address.',
    'Related companies often trade with each other at arm’s length, for example a group supplier.',
  ),
  typology(
    'pat_25ad765688246a64',
    'cash_split',
    'Cash withdrawals just under a reference amount',
    'Several cash withdrawals from the loan account, each just below the reference amount, within a few days.',
    'Some businesses pay wages or farm labour in cash in similar amounts every week.',
  ),
  make({
    pattern_id: 'pat_3f9d8e7b254f9575',
    definition: {
      template: 'sequence',
      steps: [
        { by: 'kind', value: 'insolvency' },
        { by: 'kind', value: 'liquidation' },
      ],
      max_gap_months: 24,
      min_lead_months: 0,
    },
    name: 'Insolvency, then liquidation within two years',
    description:
      'An insolvency (CIRP) record on the entity is followed by a liquidation record within twenty-four months.',
    benign_explanations: [
      'A resolution can fail for reasons outside the company, such as no bidder in a weak sector.',
    ],
    evidence_statuses: ['fact'],
  }),
  typology(
    'pat_4bfebf5efd553056',
    'circular',
    'Money returns to the borrower in a loop',
    'Money leaves the loan account, passes through one or more parties and comes back to the borrower within the window.',
    'A refund, a reversed payment or a returned advance can look like a loop.',
  ),
  make({
    pattern_id: 'pat_5dcb46f7908f3927',
    definition: {
      template: 'co_occurrence',
      matchers: [
        { by: 'kind', value: 'enforcement' },
        { by: 'kind', value: 'insolvency' },
      ],
      min_sources: 2,
      window_months: 24,
    },
    name: 'Enforcement and insolvency records close together',
    description:
      'An enforcement record and an insolvency record on the entity, from two different sources, within twenty-four months.',
    benign_explanations: [
      'Enforcement records are often allegations; an insolvency can have unrelated commercial causes.',
    ],
    evidence_statuses: ['allegation', 'fact'],
  }),
  typology(
    'pat_6f6796c2f03e99e1',
    'repeated_counterparty',
    'One counterparty paid by several loans',
    'The same counterparty receives money from several different loans within a short window.',
    'A large dealer or input supplier in one district is often paid by many borrowers.',
  ),
  typology(
    'pat_d3ad024e84b8df7b',
    'rapid_onward',
    'Most of the loan moved on within hours',
    'Most of the disbursed amount leaves the loan account within a few hours or days of disbursement.',
    'A loan for a planned purchase is often paid to the seller on the same day.',
  ),
  make({
    pattern_id: 'pat_eac985d196ae4cb5',
    definition: {
      template: 'sequence',
      steps: [
        { by: 'kind', value: 'enforcement' },
        { by: 'kind', value: 'insolvency' },
      ],
      max_gap_months: 36,
      min_lead_months: 0,
    },
    name: 'Enforcement record, then insolvency within three years',
    description:
      'An enforcement record (ED, SEBI, SFIO or RBI) on the entity is followed by an insolvency (CIRP) record within thirty-six months.',
    benign_explanations: [
      'An enforcement record is often an allegation and many entities named in one keep trading.',
    ],
    evidence_statuses: ['allegation', 'fact'],
  }),
];

/** The sealed version 1 library. */
export const HAND_WRITTEN_LIBRARY: PatternLibrary = {
  schema_version: 1,
  library_version: 1,
  content_hash: 'd5ecbbeb907ea4e8c3799e5fbcfcdb8eecb1dbda17f6e4aea527333cdbce8c9f',
  patterns: PATTERNS,
};
