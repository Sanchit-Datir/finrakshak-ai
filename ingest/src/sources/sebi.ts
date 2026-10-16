import type { ListingItem } from '@fund-tracker/shared';
import * as cheerio from 'cheerio';
import { log } from '../log.js';
import { parseDate } from '../util/dates.js';
import { absoluteUrl, cleanText, stableId } from '../util/ids.js';
import type { SourceAdapter, SourceContext } from './types.js';

const BASE = 'https://www.sebi.gov.in';
const AJAX = `${BASE}/sebiweb/ajax/home/getnewslistinfo.jsp`;

/** Enforcement → Orders sub-menus (smid) with the label SEBI uses. */
const ORDER_TYPES: readonly (readonly [number, string])[] = [
  [2, 'Orders of Chairperson/Members'],
  [6, 'Orders of AO'],
  [3, 'Settlement Order'],
  [133, 'Orders of ED / CGM (Quasi-Judicial Authorities)'],
  [1, 'Orders of SAT'],
  [7, 'Orders of Courts'],
  [77, 'Orders Of Special Courts'],
];

const listingUrl = (smid: number): string =>
  `${BASE}/sebiweb/home/HomeAction.do?doListing=yes&sid=2&ssid=9&smid=${smid}`;

function appealRefs(titleAttr: string): string {
  const refs = [
    ...titleAttr.matchAll(
      /SAT Appeal No\.?:?\s*(?:<\/span>)?\s*(?:<a[^>]*>)?(?:<em[^>]*><\/em>)?([^<\]]+)/gi,
    ),
  ];
  return refs
    .map((m) => cleanText(m[1] ?? ''))
    .filter(Boolean)
    .join('; ');
}

export function parseSebiRows(html: string, collection: string, runAt: string): ListingItem[] {
  const $ = cheerio.load(html);
  const items: ListingItem[] = [];
  $('tr').each((_, tr) => {
    const a = $(tr).find('a[href*="/enforcement/orders/"]').first();
    const href = absoluteUrl(a.attr('href') ?? '', BASE);
    const title = cleanText(a.text());
    if (!href || title.length === 0) return;
    const titleAttr = a.attr('title') ?? '';
    items.push({
      item_id: stableId('sebi', href),
      source_id: 'sebi',
      collection,
      title,
      detail_url: href,
      document_urls: [],
      published_date: parseDate(cleanText($(tr).find('td').first().text())),
      fields: { order_type: collection, sat_appeal: appealRefs(titleAttr) },
      listed_at: runAt,
    });
  });
  return items;
}

function totalRecords(html: string): number {
  return Number(/of\s+(\d+)\s+records/.exec(html)?.[1] ?? '0');
}

async function listOrderType(
  smid: number,
  label: string,
  ctx: SourceContext,
): Promise<ListingItem[]> {
  const collection = `sebi.orders.${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+$/, '')}`;
  const first = await ctx.fetcher.fetch(listingUrl(smid));
  const html = first.body.toString('utf8');
  const items = parseSebiRows(html, collection, ctx.runAt);
  const pages = Math.ceil(totalRecords(html) / 25);
  for (let page = 1; page < pages; page++) {
    let rows = await fetchPage(smid, label, page, collection, ctx);
    if (rows.length === 0) {
      // The listing session can expire; reopen the listing page once, as a browser would.
      await ctx.fetcher.fetch(listingUrl(smid));
      rows = await fetchPage(smid, label, page, collection, ctx);
      if (rows.length === 0) log.warn('empty SEBI page', { smid, page });
    }
    items.push(...rows);
  }
  return items;
}

async function fetchPage(
  smid: number,
  label: string,
  page: number,
  collection: string,
  ctx: SourceContext,
): Promise<ListingItem[]> {
  const res = await ctx.fetcher.fetch(AJAX, {
    referer: listingUrl(smid),
    form: ajaxForm(smid, label, page),
  });
  return parseSebiRows(res.body.toString('utf8'), collection, ctx.runAt);
}

function ajaxForm(smid: number, label: string, page: number): Record<string, string> {
  return {
    nextValue: '1',
    next: 'n',
    search: '',
    fromDate: '',
    toDate: '',
    fromYear: '',
    toYear: '',
    deptId: '',
    sid: '2',
    ssid: '9',
    smid: String(smid),
    ssidhidden: '9',
    intmid: '-1',
    sText: 'Enforcement',
    ssText: 'Orders',
    smText: label,
    doDirect: String(page),
  };
}

export const sebiAdapter: SourceAdapter = {
  id: 'sebi',
  termsNote:
    'sebi.gov.in public enforcement order; robots.txt permits crawling (only /js and /css disallowed). Orders may be appealed (SAT) or settled without admission; record status separately.',
  async list(ctx: SourceContext): Promise<ListingItem[]> {
    const all: ListingItem[] = [];
    for (const [smid, label] of ORDER_TYPES) all.push(...(await listOrderType(smid, label, ctx)));
    return all;
  },
  async resolveDocuments(item: ListingItem, ctx: SourceContext): Promise<string[]> {
    if (!item.detail_url) return [];
    const res = await ctx.fetcher.fetch(item.detail_url);
    await ctx.store.save(res, sebiAdapter.termsNote);
    const html = res.body.toString('utf8');
    const pdfs = new Set<string>();
    for (const m of html.matchAll(
      /(?:https?:\/\/www\.sebi\.gov\.in)?\/sebi_data\/[^"'\s<>?#]+?\.pdf/gi,
    )) {
      const url = absoluteUrl(m[0], BASE);
      if (url) pdfs.add(url);
    }
    return pdfs.size > 0 ? [...pdfs] : [item.detail_url];
  },
};
