/** Entities and the relationships between them (the entity graph). */

import { z } from 'zod';
import { id, isoDate } from './primitives.js';

export const EntityKindSchema = z.enum([
  'individual',
  'company',
  'account',
  'loan',
  'document',
  'proceeding',
  'counterparty',
]);

export type EntityKind = z.infer<typeof EntityKindSchema>;

export const EntitySchema = z.object({
  id,
  kind: EntityKindSchema,
  name: z.string(),
  subtitle: z.string(),
  /** For accounts: owning entity. */
  ownerId: id.nullable(),
  borrowerId: id.nullable(),
});

export type Entity = z.infer<typeof EntitySchema>;

export const RelationshipTypeSchema = z.enum([
  'director_of',
  'owner_of',
  'borrower_for',
  'guarantor_for',
  'shared_identifier',
  'same_proceeding',
  'shares_address',
  'account_of',
]);

export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const LinkStatusSchema = z.enum(['verified', 'user_provided', 'inferred']);

export type LinkStatus = z.infer<typeof LinkStatusSchema>;

export const RelationshipSchema = z.object({
  id,
  from: id,
  to: id,
  type: RelationshipTypeSchema,
  status: LinkStatusSchema,
  source: z.string(),
  observedAt: isoDate,
  evidence: z.string(),
});

export type Relationship = z.infer<typeof RelationshipSchema>;
