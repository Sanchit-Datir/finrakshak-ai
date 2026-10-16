import { z } from 'zod';
import { SourceIdSchema } from './sources.js';

/** Calendar date as published by the source (IST, no time component). */
export const IsoDateSchema = z.string().date();
/** UTC instant, ISO-8601. */
export const UtcTimestampSchema = z.string().datetime();
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * One row of a source listing (a table row, JSON item or feed entry), before
 * any document is downloaded. `fields` keeps the listing columns verbatim.
 */
export const ListingItemSchema = z.object({
  item_id: z.string().min(1),
  source_id: SourceIdSchema,
  collection: z.string().min(1),
  title: z.string().trim().min(1).max(2_000),
  detail_url: z.string().url().nullable(),
  document_urls: z.array(z.string().url()),
  published_date: IsoDateSchema.nullable(),
  fields: z.record(z.string(), z.string()),
  listed_at: UtcTimestampSchema,
});
export type ListingItem = z.infer<typeof ListingItemSchema>;

/** One immutable raw artifact stored on disk / Cloud Storage. */
export const RawArtifactSchema = z.object({
  sha256: Sha256Schema,
  source_id: SourceIdSchema,
  url: z.string().url(),
  final_url: z.string().url(),
  retrieved_at: UtcTimestampSchema,
  http_status: z.number().int(),
  content_type: z.string(),
  bytes: z.number().int().nonnegative(),
  path: z.string().min(1),
  terms_note: z.string().min(1),
});
export type RawArtifact = z.infer<typeof RawArtifactSchema>;

/** Canonical Document table (brief section 8). */
export const DocumentRecordSchema = z.object({
  document_id: z.string().min(1),
  source_id: SourceIdSchema,
  collection: z.string().min(1),
  item_id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  publication_date: IsoDateSchema.nullable(),
  retrieval_date: UtcTimestampSchema.nullable(),
  checksum_sha256: Sha256Schema.nullable(),
  file_location: z.string().nullable(),
  content_type: z.string().nullable(),
  text_chars: z.number().int().nonnegative(),
  page_count: z.number().int().nonnegative(),
  terms_note: z.string().min(1),
});
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
