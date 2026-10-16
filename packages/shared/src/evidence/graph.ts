import { z } from 'zod';
import { MoneySchema } from '../money.js';
import { IsoDateSchema } from './documents.js';
import { SourceIdSchema } from './sources.js';

export const ENTITY_TYPES = [
  'company',
  'llp',
  'bank',
  'nbfc',
  'audit_firm',
  'government_body',
  'other_org',
] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/** How an entity was resolved. Fuzzy matches are never merged automatically. */
export const MATCH_METHODS = [
  'exact_cin',
  'mca_master_name',
  'normalized_name',
  'unresolved',
] as const;
export const MatchMethodSchema = z.enum(MATCH_METHODS);

export const EntitySchema = z.object({
  entity_id: z.string().min(1),
  entity_type: EntityTypeSchema,
  canonical_name: z.string().min(1),
  cin: z.string().nullable(),
  status: z.string().nullable(),
  incorporation_date: IsoDateSchema.nullable(),
  jurisdiction: z.string(),
  aliases: z.array(z.string()),
  match_method: MatchMethodSchema,
  sources: z.array(SourceIdSchema),
  mention_count: z.number().int().nonnegative(),
});
export type Entity = z.infer<typeof EntitySchema>;

/** Registered office address (brief section 8: Address). */
export const AddressSchema = z.object({
  address_id: z.string().min(1),
  normalized_address: z.string().min(1),
  raw_address: z.string().min(1),
  state: z.string().nullable(),
  normalization_confidence: z.number().min(0).max(1),
  entity_count: z.number().int().nonnegative(),
});
export type Address = z.infer<typeof AddressSchema>;

/** Public professional role only (brief: collect only necessary information). */
export const PersonSchema = z.object({
  person_id: z.string().min(1),
  name: z.string().min(1),
  name_variants: z.array(z.string()),
  roles: z.array(z.string()),
  sources: z.array(SourceIdSchema),
});
export type Person = z.infer<typeof PersonSchema>;

export const RELATIONSHIP_TYPES = [
  'NAMED_IN_PROCEEDING',
  'INSOLVENCY_APPLICANT_AGAINST',
  'INSOLVENCY_PROFESSIONAL_FOR',
  'AUDITOR_OF',
  'AUDIT_PARTNER_FOR',
  'REGULATORY_ACTION_AGAINST',
  'CO_MENTIONED_WITH',
  'REGISTERED_AT',
] as const;
export const RelationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

/** fact = stated in an official record; finding = adjudicated; allegation = not yet adjudicated. */
export const EVIDENCE_STATUSES = ['fact', 'finding', 'allegation', 'inference'] as const;
export const EvidenceStatusSchema = z.enum(EVIDENCE_STATUSES);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const RelationshipSchema = z.object({
  relationship_id: z.string().min(1),
  from_id: z.string().min(1),
  relationship_type: RelationshipTypeSchema,
  to_id: z.string().min(1),
  valid_from: IsoDateSchema.nullable(),
  valid_to: IsoDateSchema.nullable(),
  first_observed_at: IsoDateSchema.nullable(),
  source_id: SourceIdSchema,
  document_id: z.string().min(1),
  evidence_status: EvidenceStatusSchema,
  confidence: z.number().min(0).max(1),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const CaseEventSchema = z.object({
  event_id: z.string().min(1),
  case_type: z.string().min(1),
  authority: z.string().min(1),
  source_id: SourceIdSchema,
  document_id: z.string().min(1),
  title: z.string().min(1),
  party_names: z.array(z.string()),
  event_date: IsoDateSchema.nullable(),
  publication_date: IsoDateSchema.nullable(),
  proceeding_status: z.string().min(1),
  outcome: z.string().nullable(),
  appeal_status: z.string().nullable(),
  amounts: z.array(MoneySchema),
});
export type CaseEvent = z.infer<typeof CaseEventSchema>;

/** Similar names that were NOT merged; for human review (brief step 5). */
export const EntityMatchCandidateSchema = z.object({
  entity_a: z.string().min(1),
  entity_b: z.string().min(1),
  name_a: z.string(),
  name_b: z.string(),
  similarity: z.number().min(0).max(1),
  reason: z.string(),
});
export type EntityMatchCandidate = z.infer<typeof EntityMatchCandidateSchema>;
