import { z } from 'zod';
import { AnalysisFindingSchema } from './applicationAnalysis.js';

/**
 * The AI investigator for one loan application (`investigateApplication` callable,
 * docs/AI_INVESTIGATOR.md). The browser prepares a bundle: the typed-in application data (identifiers
 * masked, B-16), ratios computed by code, a public-records shortlist per party made by code, related
 * entities and the check findings. Gemini reads it only through a closed list of tools and proposes
 * findings and draft questions that cite the bundle; code verifies every citation, quoted value and
 * number before anything is kept. Leads for a reviewer, never a verdict (B-58, B-67).
 */

export const INVESTIGATION_LIMITS = {
  /** Fields per section of the bundle (customers: 4 fields for each of up to 10 customers). */
  maxSectionFields: 20,
  maxCustomerFields: 40,
  maxRatios: 12,
  /** Applicant, business and up to 10 declared customers. */
  maxParties: 12,
  maxCandidatesPerParty: 5,
  maxRecordsPerCandidate: 5,
  maxRelatedPerParty: 8,
  maxCheckFindings: 25,
  maxValueChars: 200,
  maxTextChars: 300,
  maxCitations: 6,
  /** Kept findings and questions; more are rejected as over the limit. */
  maxFindings: 10,
  maxQuestions: 8,
  maxSummaryChars: 800,
  /** Reads (get_*) the model may make; submissions have their own caps above. */
  maxReadCalls: 8,
  /** Model turns (each may hold several tool calls). */
  maxTurns: 10,
  /** Size of the serialised bundle the function accepts (B-10). */
  maxBundleChars: 40_000,
} as const;

const L = INVESTIGATION_LIMITS;
const ref = z.string().min(1).max(80);
const text = (max: number): z.ZodString => z.string().trim().max(max);

export const INVESTIGATION_SECTIONS = [
  'applicant',
  'business',
  'loan',
  'collateral',
  'customers',
] as const;
export type InvestigationSection = (typeof INVESTIGATION_SECTIONS)[number];

/** One typed-in field. `path` (e.g. `loan.amount`, `customers.2.name`) is what a claim cites. */
export const InvestigationFieldSchema = z.object({
  path: ref,
  label: text(120).min(1),
  /** Empty when the applicant left it blank (the investigator may ask for it). */
  value: text(L.maxValueChars),
});
export type InvestigationField = z.infer<typeof InvestigationFieldSchema>;

/** A ratio computed by code; the model may quote it but never computes one. */
export const InvestigationRatioSchema = z.object({
  name: ref,
  label: text(120).min(1),
  value: text(40).min(1),
  /** How code computed it, including any assumption. */
  basis: text(L.maxTextChars),
});
export type InvestigationRatio = z.infer<typeof InvestigationRatioSchema>;

export const InvestigationRecordSchema = z.object({
  recordId: ref,
  kind: z.enum(['insolvency', 'liquidation', 'enforcement']),
  date: z.string().max(10).nullable(),
  title: text(L.maxValueChars),
});
export type InvestigationRecord = z.infer<typeof InvestigationRecordSchema>;

/** A public-records company code shortlisted for a party by fuzzy name matching. */
export const InvestigationCandidateSchema = z.object({
  candidateId: ref,
  name: text(L.maxValueChars).min(1),
  cin: z.string().max(30).nullable(),
  address: text(L.maxValueChars).nullable(),
  status: text(120).nullable(),
  /** Name similarity computed by code, 0–100. */
  nameScore: z.number().int().min(0).max(100),
  /** Null when there is nothing to compare (no CIN or address on one side). */
  cinAgrees: z.boolean().nullable(),
  addressAgrees: z.boolean().nullable(),
  records: z.array(InvestigationRecordSchema).max(L.maxRecordsPerCandidate),
});
export type InvestigationCandidate = z.infer<typeof InvestigationCandidateSchema>;

/** A director, shared address or similar link recorded in the workspace or the public records. */
export const InvestigationRelatedSchema = z.object({
  entityId: ref,
  name: text(L.maxValueChars).min(1),
  relation: text(120).min(1),
  source: z.enum(['workspace', 'public_records']),
  /** Why the entity may matter (open case, insolvency, liquidation); null when nothing is known. */
  concern: text(L.maxValueChars).nullable(),
});
export type InvestigationRelated = z.infer<typeof InvestigationRelatedSchema>;

export const InvestigationPartySchema = z.object({
  /** `applicant`, `business` or `customer:<n>`. */
  partyId: ref,
  role: z.enum(['applicant', 'business', 'customer']),
  name: text(L.maxValueChars).min(1),
  cin: z.string().max(30),
  candidates: z.array(InvestigationCandidateSchema).max(L.maxCandidatesPerParty),
  related: z.array(InvestigationRelatedSchema).max(L.maxRelatedPerParty),
});
export type InvestigationParty = z.infer<typeof InvestigationPartySchema>;

export const InvestigateApplicationInputSchema = z.object({
  borrowerType: z.enum([
    'individual',
    'farmer',
    'proprietorship',
    'partnership',
    'private_limited',
    'other',
  ]),
  sections: z.object({
    applicant: z.array(InvestigationFieldSchema).max(L.maxSectionFields),
    business: z.array(InvestigationFieldSchema).max(L.maxSectionFields),
    loan: z.array(InvestigationFieldSchema).max(L.maxSectionFields),
    collateral: z.array(InvestigationFieldSchema).max(L.maxSectionFields),
    customers: z.array(InvestigationFieldSchema).max(L.maxCustomerFields),
  }),
  ratios: z.array(InvestigationRatioSchema).max(L.maxRatios),
  parties: z.array(InvestigationPartySchema).max(L.maxParties),
  findings: z.array(AnalysisFindingSchema).max(L.maxCheckFindings),
});
export type InvestigateApplicationInput = z.infer<typeof InvestigateApplicationInputSchema>;

export const CitationSchema = z.discriminatedUnion('type', [
  /** `quote`, when given, must appear in the field's value. */
  z.object({ type: z.literal('field'), path: ref, quote: text(L.maxValueChars).nullable() }),
  z.object({ type: z.literal('ratio'), name: ref }),
  /** A shortlisted candidate or one of its records. */
  z.object({ type: z.literal('record'), id: ref }),
  z.object({ type: z.literal('entity'), id: ref }),
]);
export type Citation = z.infer<typeof CitationSchema>;

export const INVESTIGATION_FINDING_KINDS = [
  'public_record_match',
  'related_entity_link',
  'implausible_numbers',
  'section_mismatch',
] as const;
export type InvestigationFindingKind = (typeof INVESTIGATION_FINDING_KINDS)[number];

export const InvestigationFindingSchema = z.object({
  id: ref,
  kind: z.enum(INVESTIGATION_FINDING_KINDS),
  priority: z.enum(['routine', 'needs_attention', 'urgent']),
  statement: text(L.maxTextChars).min(1),
  partyId: ref.nullable(),
  /**
   * Public-record matches only, set by code: `strong` when the CIN or the address also agrees,
   * otherwise `possible` (needs verification, at most Needs attention).
   */
  match: z.enum(['possible', 'strong']).nullable(),
  citations: z.array(CitationSchema).min(1).max(L.maxCitations),
});
export type InvestigationFinding = z.infer<typeof InvestigationFindingSchema>;

/** A draft request-for-information question; an officer approves or edits it before use. */
export const InvestigationQuestionSchema = z.object({
  id: ref,
  question: text(L.maxTextChars).min(1),
  /** The field path or section the question is about. */
  gap: ref,
  citations: z.array(CitationSchema).max(L.maxCitations),
});
export type InvestigationQuestion = z.infer<typeof InvestigationQuestionSchema>;

/** Why code rejected a claim (shown as counts; never the claim's text). */
export const REJECTION_REASONS = [
  'invalid',
  'unknown_field',
  'quote_mismatch',
  'unknown_ratio',
  'unknown_record',
  'not_in_shortlist',
  'unknown_entity',
  'unknown_party',
  'unknown_number',
  'verdict_word',
  'stated_score',
  'missing_evidence',
  'over_limit',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const InvestigateApplicationResultSchema = z.object({
  /** True when the free mock answered: nothing was sent to a model. */
  mock: z.boolean(),
  model: z.string().nullable(),
  investigatedAt: z.string().datetime(),
  /** Empty when withheld by the wording check or never submitted. */
  summary: text(L.maxSummaryChars),
  /** The investigator said the bundle does not hold enough evidence to raise anything. */
  notEnoughEvidence: z.boolean(),
  findings: z.array(InvestigationFindingSchema).max(L.maxFindings),
  questions: z.array(InvestigationQuestionSchema).max(L.maxQuestions),
  claims: z.object({
    made: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  rejections: z
    .array(z.object({ reason: z.enum(REJECTION_REASONS), count: z.number().int().positive() }))
    .max(REJECTION_REASONS.length),
  toolCalls: z.number().int().nonnegative(),
  /** Model calls made; each billed one counts against the daily AI limit (owner, 18 Oct 2026). */
  modelCalls: z.number().int().nonnegative(),
  /** The run stopped early because the daily AI limit was reached; what was verified is kept. */
  stoppedAtDailyLimit: z.boolean(),
  /** Billed calls left today; null when the mock answered. */
  remainingToday: z.number().int().nonnegative().nullable(),
});
export type InvestigateApplicationResult = z.infer<typeof InvestigateApplicationResultSchema>;
