import { z } from 'zod';
import { MoneySchema } from '../money.js';
import { IsoDateSchema, UtcTimestampSchema } from './documents.js';
import { EvidenceStatusSchema } from './graph.js';
import { SourceIdSchema } from './sources.js';

export const EXTRACTION_METHODS = ['listing_field', 'regex', 'gemini', 'manual'] as const;
export const ExtractionMethodSchema = z.enum(EXTRACTION_METHODS);

/** One source-grounded statement (brief section 8: EvidenceClaim). */
export const EvidenceClaimSchema = z.object({
  claim_id: z.string().min(1),
  subject_id: z.string().min(1),
  predicate: z.string().min(1),
  object_value: z.string(),
  amount: MoneySchema.nullable(),
  document_id: z.string().min(1),
  source_id: SourceIdSchema,
  page: z.number().int().positive().nullable(),
  excerpt: z.string().max(600),
  extraction_method: ExtractionMethodSchema,
  extractor_version: z.string().min(1),
  extracted_at: UtcTimestampSchema,
  status: EvidenceStatusSchema,
  confidence: z.number().min(0).max(1),
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const REVIEW_STATUSES = [
  'unreviewed',
  'relevant',
  'irrelevant',
  'needs_more_evidence',
] as const;

/** An explainable lead — never a fraud verdict (brief section 10). */
export const RiskSignalSchema = z.object({
  signal_id: z.string().min(1),
  subject_id: z.string().min(1),
  signal_type: z.string().min(1),
  value: z.number(),
  explanation: z.string().min(1),
  feature_date: IsoDateSchema.nullable(),
  document_ids: z.array(z.string()),
  benign_explanations: z.array(z.string()),
  review_status: z.enum(REVIEW_STATUSES),
});
export type RiskSignal = z.infer<typeof RiskSignalSchema>;

/** A hand-picked historical case used for engineering and backtests (brief step 2). */
export const CaseSeedSchema = z.object({
  case_id: z.string().regex(/^[a-z0-9_]+$/),
  display_name: z.string().min(1),
  aliases: z.array(z.string().min(3)).min(1),
  related_aliases: z.array(z.string().min(3)),
  selection_reason: z.string().min(1),
  verification_status: z.enum(['seed_candidate_unverified', 'verified']),
});
export type CaseSeed = z.infer<typeof CaseSeedSchema>;

export const CaseDocumentLinkSchema = z.object({
  case_id: z.string().min(1),
  document_id: z.string().min(1),
  source_id: SourceIdSchema,
  matched_alias: z.string().min(1),
  matched_in: z.enum(['title', 'text', 'listing_field']),
  publication_date: IsoDateSchema.nullable(),
});
export type CaseDocumentLink = z.infer<typeof CaseDocumentLinkSchema>;
