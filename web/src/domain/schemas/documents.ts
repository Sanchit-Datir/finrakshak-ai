/** Uploaded or sample documents, their pages and extracted fields. */

import { z } from 'zod';
import { AuditEntrySchema, id, isoDate } from './primitives.js';

export const LanguageSchema = z.enum(['mr', 'en', 'hi', 'mixed', 'other']);

export type Language = z.infer<typeof LanguageSchema>;

export const ProcessingStateSchema = z.enum([
  'queued',
  'uploading',
  'processing',
  'needs_review',
  'completed',
  'failed',
]);

export type ProcessingState = z.infer<typeof ProcessingStateSchema>;

export const FieldStateSchema = z.enum(['unreviewed', 'confirmed', 'corrected', 'unclear']);

export type FieldState = z.infer<typeof FieldStateSchema>;

export const RegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export type Region = z.infer<typeof RegionSchema>;

export const ExtractedFieldSchema = z.object({
  id,
  key: z.string(),
  label: z.string(),
  /** Value as machine-extracted (or null for manual entry). Never overwritten. */
  machineValue: z.string().nullable(),
  /** Current reviewed value. Equals machineValue until a human corrects it. */
  value: z.string(),
  origin: z.enum(['simulated', 'manual']),
  page: z.number().int().nonnegative(),
  region: RegionSchema.nullable(),
  quality: z.enum(['clear', 'low', 'handwritten', 'unreadable', 'not_applicable']),
  state: FieldStateSchema,
  reviewedBy: z.string().nullable(),
  reviewedAt: isoDate.nullable(),
});

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const DocumentPageSchema = z.object({
  index: z.number().int().nonnegative(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

export type DocumentPage = z.infer<typeof DocumentPageSchema>;

export const DocumentSchema = z.object({
  id,
  applicationId: id.nullable(),
  borrowerId: id.nullable(),
  filename: z.string(),
  docType: z.string().nullable(),
  language: LanguageSchema.nullable(),
  source: z.enum(['demo', 'upload', 'camera']),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pages: z.array(DocumentPageSchema),
  uploadedBy: z.string(),
  uploadedAt: isoDate,
  processing: ProcessingStateSchema,
  failureReason: z.string().nullable(),
  qualityWarnings: z.array(z.string()),
  /** Key into the synthetic sample registry (demo docs only). */
  sampleId: z.string().nullable(),
  fields: z.array(ExtractedFieldSchema),
  audit: z.array(AuditEntrySchema),
});

export type FtDocument = z.infer<typeof DocumentSchema>;
