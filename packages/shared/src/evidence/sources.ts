import { z } from 'zod';

/** Public sources from the project brief (section 5). */
export const SOURCE_IDS = [
  'mca_ogd',
  'sebi',
  'nse_bse',
  'ibbi',
  'sfio',
  'ed',
  'nclt',
  'ecourts_sci',
  'rbi',
  'nfra',
] as const;
export const SourceIdSchema = z.enum(SOURCE_IDS);
export type SourceId = z.infer<typeof SourceIdSchema>;

/** Outcome of the Phase 0 access audit for a source. */
export const ACCESS_STATUSES = [
  'automated_ok',
  'blocked_by_robots',
  'blocked_by_server',
  'licence_required',
  'captcha_or_login',
  'manual_only',
] as const;
export const AccessStatusSchema = z.enum(ACCESS_STATUSES);
export type AccessStatus = z.infer<typeof AccessStatusSchema>;

export const SourceRegistryEntrySchema = z.object({
  source_id: SourceIdSchema,
  owner: z.string().min(1),
  urls: z.array(z.string().url()).min(1),
  access_status: AccessStatusSchema,
  access_method: z.string().min(1),
  robots_txt: z.string().min(1),
  terms_summary: z.string().min(1),
  terms_url: z.string().url().nullable(),
  attribution: z.string().min(1),
  commercial_reuse: z.enum(['permitted_with_attribution', 'permission_required', 'unknown']),
  rate_limit_policy: z.string().min(1),
  refresh_cadence: z.string().min(1),
  collections: z.array(z.string().min(1)),
  known_gaps: z.array(z.string().min(1)),
  last_checked: z.string().date(),
});
export type SourceRegistryEntry = z.infer<typeof SourceRegistryEntrySchema>;
