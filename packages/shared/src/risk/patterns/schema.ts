import { z } from 'zod';
import { UtcTimestampSchema } from '../../evidence/documents.js';
import { EVIDENCE_STATUSES } from '../../evidence/graph.js';
import { SourceIdSchema } from '../../evidence/sources.js';
import { RECORD_KINDS } from '../recordKinds.js';
import { MONITORING_RULE_IDS } from '../rules/types.js';
import { violatesWording } from '../wording.js';

/**
 * The pattern contract (docs/plans/PATTERN_CONTRACT.md): the one object that passes from the pattern
 * miner to the risk scoring job. A pattern carries no weights; how much a match counts is the
 * scorer's decision. Fields are snake_case like the other shared evidence schemas.
 */

export const PATTERN_SCHEMA_VERSION = 1 as const;
export const PATTERN_TEMPLATES = [
  'sequence',
  'co_occurrence',
  'graph_proximity',
  'transaction_typology',
] as const;
export type PatternTemplate = (typeof PATTERN_TEMPLATES)[number];

export const PATTERN_STATUSES = ['draft', 'approved', 'retired'] as const;
export const PATTERN_ORIGINS = ['hand_written', 'miner'] as const;
export const PATTERN_BASES = ['mined', 'hand_written_hypothesis'] as const;

export const PatternIdSchema = z.string().regex(/^pat_[0-9a-f]{16}$/);
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const CaseIdSchema = z.string().regex(/^[a-z0-9_]+$/);

/** Which timeline event satisfies a step. */
export const StepMatcherSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('case_type'), value: z.string().regex(/^[a-z0-9_]{2,80}$/) }),
  z.object({ by: z.literal('kind'), value: z.enum(RECORD_KINDS) }),
  z.object({ by: z.literal('source'), value: SourceIdSchema }),
]);
export type StepMatcher = z.infer<typeof StepMatcherSchema>;

const months = (min: number): z.ZodNumber => z.number().int().min(min).max(60);

export const PatternDefinitionSchema = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('sequence'),
    steps: z.array(StepMatcherSchema).min(2).max(4),
    max_gap_months: months(1),
    min_lead_months: months(0),
  }),
  z.object({
    template: z.literal('co_occurrence'),
    matchers: z.array(StepMatcherSchema).min(2).max(4),
    min_sources: z.number().int().min(1).max(6),
    window_months: months(1),
  }),
  z.object({
    template: z.literal('graph_proximity'),
    kind: z.enum(RECORD_KINDS),
    max_hops: z.number().int().min(1).max(3),
    exclude_hubs: z.literal(true),
  }),
  z.object({
    template: z.literal('transaction_typology'),
    rule_id: z.enum(MONITORING_RULE_IDS),
  }),
]);
export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;

const PopulationSchema = z
  .object({
    n: z.number().int().nonnegative(),
    follow_on: z.number().int().nonnegative(),
    lift: z.number().nonnegative(),
  })
  .refine((p) => p.follow_on <= p.n, 'follow_on cannot exceed n');

export const PatternSupportSchema = z
  .object({
    basis: z.enum(PATTERN_BASES),
    supporting_case_ids: z.array(CaseIdSchema),
    /** Distinct cases, never entries (B-60). */
    supporting_case_count: z.number().int().nonnegative(),
    /** Baseline among entities named in adverse records (B-59). Null for a hypothesis. */
    population: PopulationSchema.nullable(),
    median_gap_months: z.number().nonnegative().nullable(),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    if (new Set(s.supporting_case_ids).size !== s.supporting_case_ids.length)
      fail('supporting_case_ids must be distinct');
    if (s.supporting_case_count !== s.supporting_case_ids.length)
      fail('supporting_case_count must equal the number of supporting_case_ids');
    if (s.basis === 'mined') {
      if (s.supporting_case_count < 2) fail('a mined pattern needs at least 2 supporting cases');
      if (s.population === null) fail('a mined pattern needs a population baseline');
    } else {
      if (s.supporting_case_count !== 0) fail('a hypothesis has no supporting cases');
      if (s.population !== null) fail('a hypothesis has no population baseline');
    }
  });
export type PatternSupport = z.infer<typeof PatternSupportSchema>;

/** Wording that describes an entity or a record must stay neutral (B-36). */
const neutral = (schema: z.ZodString): z.ZodEffects<z.ZodString> =>
  schema.refine((t) => !violatesWording(t), 'uses verdict words; describe the record neutrally');

export const PatternSchema = z
  .object({
    schema_version: z.literal(PATTERN_SCHEMA_VERSION),
    pattern_id: PatternIdSchema,
    version: z.number().int().min(1),
    name: neutral(z.string().min(3).max(80)),
    description: neutral(z.string().min(20).max(400)),
    benign_explanations: z
      .array(neutral(z.string().min(1).max(200)))
      .min(1)
      .max(5),
    origin: z.enum(PATTERN_ORIGINS),
    status: z.enum(PATTERN_STATUSES),
    definition: PatternDefinitionSchema,
    support: PatternSupportSchema,
    /** The statuses of the events the pattern rests on (B-36); never upgraded. */
    evidence_statuses: z.array(z.enum(EVIDENCE_STATUSES)),
    created_at: UtcTimestampSchema,
    approved_by: z.string().min(1).max(128).nullable(),
    approved_at: UtcTimestampSchema.nullable(),
    retired_at: UtcTimestampSchema.nullable(),
    supersedes: PatternIdSchema.nullable(),
  })
  .superRefine((p, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    if (p.origin === 'miner' && p.support.basis !== 'mined')
      fail('a pattern from the miner must have mined support');
    if (p.support.basis === 'hand_written_hypothesis' && p.origin !== 'hand_written')
      fail('a hypothesis must be hand written');
    if (p.definition.template === 'transaction_typology' && p.origin !== 'hand_written')
      fail('a transaction typology is hand written only');
    const approved = p.approved_by !== null && p.approved_at !== null;
    const anyApproval = p.approved_by !== null || p.approved_at !== null;
    if (p.status === 'draft' && (anyApproval || p.retired_at !== null))
      fail('a draft has no approval and is not retired');
    if (p.status === 'approved' && (!approved || p.retired_at !== null))
      fail('an approved pattern needs approved_by and approved_at and is not retired');
    if (p.status === 'retired' && (!approved || p.retired_at === null))
      fail('a retired pattern needs its approval and retired_at');
    if (p.supersedes === p.pattern_id) fail('a pattern cannot supersede itself');
  });
export type Pattern = z.infer<typeof PatternSchema>;

/** The envelope the scorer reads. Patterns are sorted by pattern_id with no duplicates. */
export const PatternLibrarySchema = z
  .object({
    schema_version: z.literal(PATTERN_SCHEMA_VERSION),
    /** Increases on every approval, retirement or change; stored as `pattern_version` on every score. */
    library_version: z.number().int().min(0),
    /** sha256 of the canonical JSON of `patterns`. */
    content_hash: Sha256HexSchema,
    patterns: z.array(PatternSchema),
  })
  .superRefine((lib, ctx) => {
    for (let i = 1; i < lib.patterns.length; i++) {
      const prev = lib.patterns[i - 1]?.pattern_id ?? '';
      const here = lib.patterns[i]?.pattern_id ?? '';
      if (here <= prev)
        ctx.addIssue({
          code: 'custom',
          path: ['patterns', i],
          message: 'patterns must be sorted by pattern_id with no duplicates',
        });
    }
  });
export type PatternLibrary = z.infer<typeof PatternLibrarySchema>;

/** The numbers the miner's code computed for a candidate (the model never sets them). */
export const CandidateStatsSchema = z.object({
  support_case_ids: z.array(CaseIdSchema),
  population: PopulationSchema.nullable(),
  gap_months: z
    .object({
      median: z.number().nonnegative(),
      p25: z.number().nonnegative(),
      p75: z.number().nonnegative(),
    })
    .nullable(),
  leave_one_out: z.object({ passed: z.boolean(), failed_without: z.array(CaseIdSchema) }),
  lead_time: z.object({ passed: z.boolean(), min_months: z.number().nonnegative().nullable() }),
});
export type CandidateStats = z.infer<typeof CandidateStatsSchema>;

export const PATTERN_PROPOSAL_STATUSES = ['proposed', 'approved', 'rejected', 'expired'] as const;

/** What the miner writes to `patternProposals/{id}`: a draft pattern plus the evidence for it. */
export const PatternProposalSchema = z.object({
  proposal_id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  run_id: z.string().min(1),
  /** The exact object that goes live on approval; it never changes between proposal and library. */
  pattern: PatternSchema.refine(
    (p) => p.status === 'draft' && p.origin === 'miner',
    'a proposed pattern is a draft from the miner',
  ),
  candidate: CandidateStatsSchema,
  /** Null when the wording was templated rather than model-written. */
  model: z.string().min(1).nullable(),
  prompt_version: z.string().min(1),
  input_hash: Sha256HexSchema,
  status: z.enum(PATTERN_PROPOSAL_STATUSES),
  created_at: UtcTimestampSchema,
  expires_at: UtcTimestampSchema,
  decided_at: UtcTimestampSchema.nullable(),
  decided_by: z.string().min(1).nullable(),
});
export type PatternProposal = z.infer<typeof PatternProposalSchema>;
