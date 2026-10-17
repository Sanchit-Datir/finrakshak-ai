import type { ListingItem } from '@fund-tracker/shared';
import { z } from 'zod';
import { parseDate } from '../util/dates.js';
import { absoluteUrl, cleanText, stableId } from '../util/ids.js';
import type { SourceAdapter, SourceContext } from './types.js';

const BASE = 'https://enforcementdirectorate.gov.in';
/** The public JSON the ED press-release page itself loads for every visitor. */
const API = `${BASE}/umbraco/backoffice/api/PressReleaseApi/GetPublic?language=en`;

const EdReleaseSchema = z.object({
  Id: z.number().int(),
  Description: z.string(),
  ReleaseDate: z.string(),
  PdfUrl: z.string().nullable(),
  Language: z.string().nullable().optional(),
});

function toItem(r: z.infer<typeof EdReleaseSchema>, runAt: string): ListingItem | null {
  const pdf = r.PdfUrl ? absoluteUrl(r.PdfUrl, BASE) : null;
  const title = cleanText(r.Description).slice(0, 2_000);
  if (title.length === 0) return null;
  return {
    item_id: stableId('ed', String(r.Id)),
    source_id: 'ed',
    collection: 'ed.press_releases',
    title,
    detail_url: null,
    document_urls: pdf ? [pdf] : [],
    published_date: parseDate(r.ReleaseDate),
    fields: { ed_id: String(r.Id), description: title, language: r.Language ?? '' },
    listed_at: runAt,
  };
}

export const edAdapter: SourceAdapter = {
  id: 'ed',
  termsNote:
    'enforcementdirectorate.gov.in copyright policy: contents may not be reproduced without permission; source must be acknowledged. Internal research retention only; press releases describe allegations/investigations, not convictions, unless stated.',
  async list(ctx: SourceContext): Promise<ListingItem[]> {
    const res = await ctx.fetcher.fetch(API, { referer: `${BASE}/media/press-release/` });
    await ctx.store.save(res, edAdapter.termsNote);
    const parsed = z.array(EdReleaseSchema).parse(JSON.parse(res.body.toString('utf8')));
    return parsed.map((r) => toItem(r, ctx.runAt)).filter((i): i is ListingItem => i !== null);
  },
  resolveDocuments(item: ListingItem): Promise<string[]> {
    return Promise.resolve(item.document_urls);
  },
};
