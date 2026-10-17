import { EvidenceStatusSchema, MoneySchema, SourceIdSchema } from '@fund-tracker/shared';
import { z } from 'zod';

export const ORG_ROLES = [
  'subject_of_action',
  'lender_or_creditor',
  'auditor',
  'insolvency_applicant',
  'regulator_or_agency',
  'other',
] as const;

export const CASE_TYPES = [
  'penalty',
  'insolvency',
  'liquidation',
  'attachment',
  'search_or_arrest',
  'prosecution',
  'audit_finding',
  'licence_action',
  'other_order',
  'not_applicable',
] as const;

/** What the model must return (tool `record_claims`). Untrusted until parsed and grounded. */
export const ModelExtractionSchema = z.object({
  organisations: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(200),
        cin: z.string().trim().max(30).nullable(),
        role: z.enum(ORG_ROLES),
        page: z.number().int().positive().nullable(),
      }),
    )
    .max(40),
  amounts: z
    .array(
      z.object({
        /** Exactly as printed (e.g. "Rs. 62.70 crore"); code converts it to paise. */
        amount_text: z.string().trim().min(2).max(80),
        about: z.string().trim().max(200),
        page: z.number().int().positive().nullable(),
      }),
    )
    .max(20),
  dates: z
    .array(
      z.object({
        date: z.string().date(),
        what: z.string().trim().max(200),
        page: z.number().int().positive().nullable(),
      }),
    )
    .max(20),
  case_type: z.enum(CASE_TYPES),
  summary: z.string().trim().max(400),
});
export type ModelExtraction = z.infer<typeof ModelExtractionSchema>;

/** JSON Schema of `record_claims` (kept next to the zod schema it mirrors). */
export const RECORD_CLAIMS_PARAMETERS = {
  type: 'object',
  properties: {
    organisations: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cin: { type: ['string', 'null'] },
          role: { type: 'string', enum: ORG_ROLES },
          page: { type: ['integer', 'null'] },
        },
        required: ['name', 'cin', 'role', 'page'],
      },
    },
    amounts: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          amount_text: { type: 'string' },
          about: { type: 'string' },
          page: { type: ['integer', 'null'] },
        },
        required: ['amount_text', 'about', 'page'],
      },
    },
    dates: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          what: { type: 'string' },
          page: { type: ['integer', 'null'] },
        },
        required: ['date', 'what', 'page'],
      },
    },
    case_type: { type: 'string', enum: CASE_TYPES },
    summary: { type: 'string' },
  },
  required: ['organisations', 'amounts', 'dates', 'case_type', 'summary'],
} as const;

/**
 * One shadow claim (BigQuery `evidence_claims_ai_shadow`). Never merged into the graph until the
 * quality gate passes and the owner approves (B-52). `evidence_status` comes from the source's
 * classification by code, never from the model (B-36).
 */
export const AiClaimRowSchema = z.object({
  claim_id: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_id: SourceIdSchema,
  item_id: z.string().min(1),
  document_url: z.string().url(),
  kind: z.enum(['organisation', 'amount', 'date', 'case_type']),
  name: z.string().nullable(),
  cin: z.string().nullable(),
  role: z.string().nullable(),
  amount: MoneySchema.nullable(),
  amount_text: z.string().nullable(),
  date: z.string().date().nullable(),
  about: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  evidence_status: EvidenceStatusSchema,
  model: z.string(),
  prompt_version: z.string(),
  extracted_at: z.string().datetime(),
});
export type AiClaimRow = z.infer<typeof AiClaimRowSchema>;

/** Stored per document and prompt version (create-only, so a document is extracted once). */
export const AiExtractionRecordSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_id: SourceIdSchema,
  item_id: z.string(),
  document_url: z.string().url(),
  model: z.string(),
  prompt_version: z.string(),
  extracted_at: z.string().datetime(),
  case_type: z.enum(CASE_TYPES),
  summary: z.string(),
  rows: z.array(AiClaimRowSchema),
  /** Model values that failed a check (not in the text, not an organisation, bad amount). */
  dropped: z.object({
    ungrounded: z.number().int().nonnegative(),
    not_organisation: z.number().int().nonnegative(),
    unparsed_amount: z.number().int().nonnegative(),
  }),
});
export type AiExtractionRecord = z.infer<typeof AiExtractionRecordSchema>;
