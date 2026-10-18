import {
  SYNTH_BANDS,
  SYNTH_ENTITY_KINDS,
  SYNTH_LINK_STATUSES,
  SYNTH_LOAN_PRODUCTS,
  SYNTH_RELATIONSHIP_TYPES,
  SYNTH_TRANSACTION_TYPES,
} from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  EntityKindSchema,
  LinkStatusSchema,
  LoanProductSchema,
  PrioritySchema,
  RelationshipTypeSchema,
  TransactionTypeSchema,
} from '../domain/schemas.js';

/**
 * The synthetic data schemas in packages/shared mirror the web app's enums (zod 3 there, zod 4 here, so
 * they cannot import each other). This test fails if either side changes a list without the other.
 */
describe('synthetic data enums match the web app', () => {
  const same = (shared: readonly string[], web: readonly string[]): void => {
    expect([...shared].sort()).toEqual([...web].sort());
  };

  it('entity kinds', () => {
    same(SYNTH_ENTITY_KINDS, EntityKindSchema.options);
  });
  it('relationship types', () => {
    same(SYNTH_RELATIONSHIP_TYPES, RelationshipTypeSchema.options);
  });
  it('link statuses', () => {
    same(SYNTH_LINK_STATUSES, LinkStatusSchema.options);
  });
  it('loan products', () => {
    same(SYNTH_LOAN_PRODUCTS, LoanProductSchema.options);
  });
  it('transaction types', () => {
    same(SYNTH_TRANSACTION_TYPES, TransactionTypeSchema.options);
  });
  it('bands are the app priorities', () => {
    same(SYNTH_BANDS, PrioritySchema.options);
  });
});
