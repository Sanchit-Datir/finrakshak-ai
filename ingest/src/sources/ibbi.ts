import type { ListingItem } from '@fund-tracker/shared';
import { assertFirstPageHasRows, shouldStopPaging } from '../delta/policy.js';
import { log } from '../log.js';
import { parseDate } from '../util/dates.js';
import { parseTable, type TableRow } from '../util/htmlTable.js';
import { stableId } from '../util/ids.js';
import type { SourceAdapter, SourceContext } from './types.js';

const LIST = 'https://ibbi.gov.in/public-announcement';
const COLLECTION = 'ibbi.public_announcements';

function lastPage(html: string): number {
  const pages = [...html.matchAll(/public-announcement\?page=(\d+)/g)].map((m) => Number(m[1]));
  return pages.length > 0 ? Math.max(...pages) : 1;
}

function rowToItem(row: TableRow, runAt: string): ListingItem | null {
  const c = row.cells;
  const debtor = c['name_of_corporate_debtor'] ?? '';
  const type = c['type_of_pa'] ?? '';
  const docs = row.links.filter((u) => /\/uploads\/announcement\//i.test(u));
  if (debtor.length === 0) return null;
  return {
    item_id: stableId('ibbi', docs[0] ?? `${debtor}|${c['date_of_announcement'] ?? ''}|${type}`),
    source_id: 'ibbi',
    collection: COLLECTION,
    title: `${type}: ${debtor}`,
    detail_url: null,
    document_urls: docs,
    published_date: parseDate(c['date_of_announcement'] ?? ''),
    fields: {
      announcement_type: type,
      corporate_debtor: debtor,
      applicant: c['name_of_applicant'] ?? '',
      insolvency_professional: c['name_of_insolvency_professional'] ?? '',
      last_date_of_submission: c['last_date_of_submission'] ?? '',
      remarks: c['remarks'] ?? '',
    },
    listed_at: runAt,
  };
}

export const ibbiAdapter: SourceAdapter = {
  id: 'ibbi',
  termsNote:
    'ibbi.gov.in public announcement (statutory notice under IBC). No robots.txt or reuse terms published; attribute IBBI. Insolvency is not evidence of fraud.',
  async list(ctx: SourceContext): Promise<ListingItem[]> {
    const items: ListingItem[] = [];
    let last = 1;
    for (let page = 1; page <= last; page++) {
      const res = await ctx.fetcher.fetch(page === 1 ? LIST : `${LIST}?page=${page}`);
      const html = res.body.toString('utf8');
      if (page === 1) last = lastPage(html);
      const rows = parseTable(html, res.finalUrl);
      if (page === 1) assertFirstPageHasRows(ctx.listing, COLLECTION, rows.length, LIST);
      if (rows.length === 0) log.warn('empty IBBI page', { page, status: res.status });
      const pageItems = rows.flatMap((row) => rowToItem(row, ctx.runAt) ?? []);
      items.push(...pageItems);
      // Newest announcements come first: a page we already hold entirely ends an incremental run.
      if (
        shouldStopPaging(
          ctx.listing,
          pageItems.map((i) => i.item_id),
        )
      )
        break;
    }
    return items;
  },
  resolveDocuments(item: ListingItem): Promise<string[]> {
    return Promise.resolve(item.document_urls);
  },
};
