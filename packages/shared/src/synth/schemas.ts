import { z } from 'zod';
import { CaseEventSchema, EntitySchema, EvidenceStatusSchema } from '../evidence/graph.js';
import { IsoDateSchema } from '../evidence/documents.js';

/**
 * Synthetic test data (docs/plans/SYNTHETIC_TRANSACTIONS_PLAN.md). Loans, entities, relationships and
 * transactions mirror the web app's own shapes field for field (web/src/domain/schemas.ts) so a
 * generated ledger can be loaded straight into the app and run through its monitoring rules. A
 * contract test in the web workspace keeps the two in step. Every record says `synthetic: true`, and
 * every name starts with `SYNTH` (B-54). Amounts are INR paise as integers (B-01).
 */

export const SYNTH_NAME_PREFIX = 'SYNTH ';

/** Mirrors of the web enums; web/src/lib/synth-enums.test.ts fails if they drift. */
export const SYNTH_ENTITY_KINDS = [
  'individual',
  'company',
  'account',
  'loan',
  'document',
  'proceeding',
  'counterparty',
] as const;
export const SYNTH_RELATIONSHIP_TYPES = [
  'director_of',
  'owner_of',
  'borrower_for',
  'guarantor_for',
  'shared_identifier',
  'same_proceeding',
  'shares_address',
  'account_of',
] as const;
export const SYNTH_LINK_STATUSES = ['verified', 'user_provided', 'inferred'] as const;
export const SYNTH_LOAN_PRODUCTS = [
  'kcc_crop',
  'agri_term',
  'warehouse_receipt',
  'msme_working_capital',
  'msme_term',
  'personal',
] as const;
export const SYNTH_TRANSACTION_TYPES = [
  'disbursement',
  'neft',
  'rtgs',
  'imps',
  'upi',
  'cheque',
  'cash_withdrawal',
  'repayment',
] as const;

/** The scenarios, in plan order. */
export const SYNTH_ARCHETYPES = [
  'control',
  'slow_burn',
  'sudden_enforcement',
  'round_trip',
  'fund_diversion',
  'contagion',
  'shared_address',
  'cash_split',
  'dormant_burst',
  'seasonal',
  'big_prepayment',
  'near_threshold',
] as const;
export const SynthArchetypeSchema = z.enum(SYNTH_ARCHETYPES);
export type SynthArchetype = z.infer<typeof SynthArchetypeSchema>;

export const SYNTH_CLASSES = ['control', 'defaulter', 'lookalike', 'held_out'] as const;
export const SynthClassSchema = z.enum(SYNTH_CLASSES);

/** The app's `Priority` ids, shown as Routine review, Needs attention and Urgent review. */
export const SYNTH_BANDS = ['routine', 'needs_attention', 'urgent'] as const;
export const SynthBandSchema = z.enum(SYNTH_BANDS);
export type SynthBand = z.infer<typeof SynthBandSchema>;

/** The monitoring rules of packages/shared/src/risk/rules (a test keeps the two lists equal). */
export const SYNTH_RULE_IDS = [
  'rapid_onward',
  'linked_counterparty',
  'repeated_counterparty',
  'circular',
  'cash_split',
] as const;
export const SynthRuleIdSchema = z.enum(SYNTH_RULE_IDS);

const synthetic = z.literal(true);
const synthName = z.string().startsWith(SYNTH_NAME_PREFIX).max(200);
const id = z.string().min(1);
const minor = z.number().int().safe();
/** A UTC instant, ISO-8601 with a trailing Z. */
const utcInstant = z.string().datetime();
/** A calendar month, `YYYY-MM`. */
export const SynthMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const SynthEntitySchema = z.object({
  id,
  kind: z.enum(SYNTH_ENTITY_KINDS),
  name: synthName,
  subtitle: z.string(),
  /** For accounts: the owning entity. */
  ownerId: id.nullable(),
  borrowerId: id.nullable(),
  synthetic,
});
export type SynthEntity = z.infer<typeof SynthEntitySchema>;

export const SynthRelationshipSchema = z.object({
  id,
  from: id,
  to: id,
  type: z.enum(SYNTH_RELATIONSHIP_TYPES),
  status: z.enum(SYNTH_LINK_STATUSES),
  source: z.string(),
  observedAt: z.string().min(1),
  evidence: z.string(),
  synthetic,
});
export type SynthRelationship = z.infer<typeof SynthRelationshipSchema>;

export const SynthLoanSchema = z.object({
  id,
  applicationId: id.nullable(),
  borrowerId: id,
  product: z.enum(SYNTH_LOAN_PRODUCTS),
  amountMinor: minor.positive(),
  disbursedAt: utcInstant,
  purpose: z.string(),
  monitoringDays: z.number().int().positive(),
  accountEntityId: id,
  dataSource: z.literal('SYNTHETIC TEST DATA'),
  lastUpdated: z.string().min(1),
  branchId: id,
  synthetic,
});
export type SynthLoan = z.infer<typeof SynthLoanSchema>;

export const SynthTransactionSchema = z.object({
  id,
  loanId: id.nullable(),
  at: utcInstant,
  fromId: id,
  toId: id,
  amountMinor: minor.positive(),
  type: z.enum(SYNTH_TRANSACTION_TYPES),
  reference: z.string(),
  /** Synthetic rows model imported bank data. */
  source: z.literal('import'),
  synthetic,
});
export type SynthTransaction = z.infer<typeof SynthTransactionSchema>;

/**
 * A public-record flag on a synthetic organisation, in the graph-lab shapes (shared `Entity` and
 * `CaseEvent`) so the public-records check can find it by name. Evidence status follows B-36.
 */
export const SynthFlagSchema = z.object({
  flag_id: id,
  entity: EntitySchema.refine((e) => e.canonical_name.startsWith(SYNTH_NAME_PREFIX), {
    message: 'flag entity name must start with SYNTH',
  }),
  event: CaseEventSchema.refine((e) => e.authority === 'SYNTHETIC', {
    message: 'flag event authority must be SYNTHETIC',
  }),
  evidence_status: EvidenceStatusSchema,
  event_date: IsoDateSchema,
  synthetic,
});
export type SynthFlag = z.infer<typeof SynthFlagSchema>;

export const SynthTruthMonthSchema = z.object({
  month: SynthMonthSchema,
  expected_band: SynthBandSchema,
  expected_patterns: z.array(z.string()),
  expected_reasons: z.array(z.string()),
});

/** The expected answer for one loan: what the rules and the scoring must find, month by month. */
export const SynthTruthSchema = z.object({
  loan_id: id,
  archetype: SynthArchetypeSchema,
  class: SynthClassSchema,
  onset_month: SynthMonthSchema.nullable(),
  /** Existing monitoring rules this loan's transactions must (or must not) trip. */
  expected_rules: z.array(SynthRuleIdSchema),
  months: z.array(SynthTruthMonthSchema).min(1),
  synthetic,
});
export type SynthTruth = z.infer<typeof SynthTruthSchema>;

export const SynthManifestSchema = z.object({
  seed: z.number().int().nonnegative(),
  generator_version: z.string().min(1),
  /** First day covered, an IST calendar date. No wall-clock time is stored, so runs are reproducible. */
  as_of_start: IsoDateSchema,
  months: z.number().int().positive(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  sha256: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  synthetic,
});
export type SynthManifest = z.infer<typeof SynthManifestSchema>;
