/** Borrowers and borrower types. */

import { z } from 'zod';
import { id, isoDate } from './primitives.js';

export const BorrowerTypeSchema = z.enum([
  'individual',
  'farmer',
  'proprietorship',
  'partnership',
  'private_limited',
  'other',
]);

export type BorrowerType = z.infer<typeof BorrowerTypeSchema>;

export const BorrowerSchema = z.object({
  id,
  name: z.string(),
  nameOriginal: z.string(),
  type: BorrowerTypeSchema,
  branchId: id,
  relationshipManager: z.string(),
  status: z.enum(['active', 'inactive']),
  maskedIdentifier: z.string(),
  /** CIN / LLPIN / registration number of a business borrower ('' when none). */
  registrationNo: z.string(),
  entityId: id,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export type Borrower = z.infer<typeof BorrowerSchema>;
