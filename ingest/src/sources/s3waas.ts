import type { ListingItem, SourceId } from '@fund-tracker/shared';
import { assertFirstPageHasRows, shouldStopPaging } from '../delta/policy.js';
import { parseDate } from '../util/dates.js';
import { parseTable, type TableRow } from '../util/htmlTable.js';
import { stableId } from '../util/ids.js';
import type { SourceContext } from './types.js';

/**
 * Government "S3WaaS" (WordPress) sites such as nfra.gov.in and sfio.gov.in
 * publish documents as a table (Title | Date | View/Download) paginated at
 * `<category>/page/N/`.
 */
export interface S3waasCategory {
  readonly collection: string;
  readonly url: string;
}

const MAX_PAGES = 200;

function rowToItem(
  sourceId: SourceId,
  collection: string,
  row: TableRow,
  runAt: string,
): ListingItem | null {
  const title = row.cells['title'] ?? row.cells['col_1'] ?? '';
  const docs = row.links.filter((u) => /\.pdf($|\?)/i.test(u));
  if (title.length === 0 || docs.length === 0) return null;
  const dateText = row.cells['date'] ?? row.cells['start_date'] ?? '';
  return {
    item_id: stableId(sourceId, docs[0] ?? title),
    source_id: sourceId,
    collection,
    title,
    detail_url: null,
    document_urls: docs,
    published_date: parseDate(dateText),
    fields: { ...row.cells },
    listed_at: runAt,
  };
}

export async function listS3waasCategory(
  sourceId: SourceId,
  category: S3waasCategory,
  ctx: SourceContext,
): Promise<ListingItem[]> {
  const items: ListingItem[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? category.url : `${category.url}page/${page}/`;
    const res = await ctx.fetcher.fetch(url);
    // A missing first page for a category we hold means it moved; past the end, 404 just ends it.
    if (res.status === 404 && page === 1)
      assertFirstPageHasRows(ctx.listing, category.collection, 0, url);
    if (res.status === 404) break;
    const rows = parseTable(res.body.toString('utf8'), res.finalUrl);
    if (page === 1) assertFirstPageHasRows(ctx.listing, category.collection, rows.length, url);
    const pageItems: ListingItem[] = [];
    for (const row of rows) {
      const item = rowToItem(sourceId, category.collection, row, ctx.runAt);
      if (item && !seen.has(item.item_id)) {
        seen.add(item.item_id);
        pageItems.push(item);
      }
    }
    items.push(...pageItems);
    // WordPress serves the last page again for out-of-range pages: stop when nothing new.
    if (pageItems.length === 0) break;
    // Newest first: an incremental run ends at the first page it already holds in full.
    if (
      shouldStopPaging(
        ctx.listing,
        pageItems.map((i) => i.item_id),
      )
    )
      break;
  }
  return items;
}
