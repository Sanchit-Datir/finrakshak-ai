import type { ListingItem } from '@fund-tracker/shared';
import * as cheerio from 'cheerio';
import { log } from '../log.js';
import { parseDate } from '../util/dates.js';
import { absoluteUrl, cleanText, stableId } from '../util/ids.js';
import type { SourceAdapter, SourceContext } from './types.js';

const LIST = 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx';
export const RBI_FIRST_YEAR = 2015;

/** Parses the press-release table: date header rows followed by item rows. */
export function parseRbiRows(html: string, runAt: string): ListingItem[] {
  const $ = cheerio.load(html);
  const items: ListingItem[] = [];
  let currentDate: string | null = null;
  $('table.tablebg tr').each((_, tr) => {
    const link = $(tr).find('a[href*="prid="]').first();
    if (link.length === 0) {
      currentDate = parseDate(cleanText($(tr).text())) ?? currentDate;
      return;
    }
    const detail = absoluteUrl(link.attr('href') ?? '', LIST);
    const title = cleanText(link.text());
    if (!detail || title.length === 0) return;
    const pdf = absoluteUrl(
      $(tr).find('a[href$=".PDF"], a[href$=".pdf"]').first().attr('href') ?? '',
      LIST,
    );
    items.push({
      item_id: stableId('rbi', detail),
      source_id: 'rbi',
      collection: 'rbi.press_releases',
      title,
      detail_url: detail,
      document_urls: pdf ? [pdf] : [],
      published_date: currentDate,
      fields: { prid: new URL(detail).searchParams.get('prid') ?? '' },
      listed_at: runAt,
    });
  });
  return items;
}

function formFields(html: string, year: number): Record<string, string> {
  const $ = cheerio.load(html);
  const form: Record<string, string> = {};
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name');
    if (name) form[name] = $(el).attr('value') ?? '';
  });
  return { ...form, hdnYear: String(year), hdnMonth: '0', __EVENTTARGET: '', __EVENTARGUMENT: '' };
}

export const rbiAdapter: SourceAdapter = {
  id: 'rbi',
  termsNote:
    'rbi.org.in press release. Public regulatory communication; attribute RBI. A penalty or licence cancellation is a regulatory action, not a fraud finding.',
  async list(ctx: SourceContext): Promise<ListingItem[]> {
    const items: ListingItem[] = [];
    const thisYear = new Date().getUTCFullYear();
    for (let year = thisYear; year >= RBI_FIRST_YEAR; year--) {
      // ASP.NET year filter: reload the page for fresh form state, then post the year.
      const page = await ctx.fetcher.fetch(LIST);
      const res = await ctx.fetcher.fetch(LIST, {
        referer: LIST,
        form: formFields(page.body.toString('utf8'), year),
      });
      const rows = parseRbiRows(res.body.toString('utf8'), ctx.runAt);
      log.info('rbi year listed', { year, rows: rows.length });
      items.push(...rows);
    }
    return dedupe(items);
  },
  resolveDocuments(item: ListingItem): Promise<string[]> {
    // The HTML detail page carries the full press-release text.
    return Promise.resolve(item.detail_url ? [item.detail_url] : item.document_urls);
  },
};

function dedupe(items: ListingItem[]): ListingItem[] {
  const seen = new Map<string, ListingItem>();
  for (const i of items) if (!seen.has(i.item_id)) seen.set(i.item_id, i);
  return [...seen.values()];
}
