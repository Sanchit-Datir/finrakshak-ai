import { ListingItemSchema, type ListingItem, type SourceId } from '@fund-tracker/shared';
import { z } from 'zod';
import { dataPath, getConfig } from './config.js';
import { PoliteFetcher } from './http/fetcher.js';
import { errorMessage, log } from './log.js';
import { selectForDownload } from './select/relevance.js';
import type { SourceAdapter, SourceContext } from './sources/types.js';
import { appendJsonl, readJsonl, writeJsonl } from './store/jsonl.js';
import { RawStore } from './store/rawStore.js';

export const ItemDocumentsSchema = z.object({
  item_id: z.string(),
  source_id: z.string(),
  document_urls: z.array(z.string().url()),
  resolved_at: z.string().datetime(),
});
export type ItemDocuments = z.infer<typeof ItemDocumentsSchema>;

export const listingFile = (s: SourceId): string => dataPath('interim', 'listings', `${s}.jsonl`);
export const itemDocsFile = (s: SourceId): string =>
  dataPath('interim', 'item_documents', `${s}.jsonl`);

export async function makeContext(sourceId: SourceId, maxItems?: number): Promise<SourceContext> {
  const base = {
    fetcher: new PoliteFetcher(getConfig()),
    store: await RawStore.open(sourceId),
    runAt: new Date().toISOString(),
  };
  return maxItems === undefined ? base : { ...base, maxItems };
}

/** Step 1: list everything the source publishes (metadata only). */
export async function runListing(
  adapter: SourceAdapter,
  ctx: SourceContext,
): Promise<ListingItem[]> {
  const items = validListing(adapter.id, await adapter.list(ctx));
  await writeJsonl(listingFile(adapter.id), items);
  const day = ctx.runAt.slice(0, 10);
  await writeJsonl(dataPath('interim', 'listings', 'history', adapter.id, `${day}.jsonl`), items);
  log.info('listing saved', { source: adapter.id, items: items.length });
  return items;
}

const MAX_TITLE = 2_000;

/** Validates listed items; over-long titles are truncated and invalid rows skipped with a warning. */
function validListing(source: SourceId, raw: readonly ListingItem[]): ListingItem[] {
  const items: ListingItem[] = [];
  for (const item of raw) {
    const parsed = ListingItemSchema.safeParse({ ...item, title: item.title.slice(0, MAX_TITLE) });
    if (parsed.success) items.push(parsed.data);
    else
      log.warn('invalid listing row skipped', {
        source,
        item: item.item_id,
        error: parsed.error.message,
      });
  }
  return items;
}

/** Step 2: download documents for selected items. Already-stored URLs are skipped. */
export async function runDownloads(
  adapter: SourceAdapter,
  ctx: SourceContext,
  max: number,
): Promise<void> {
  const items = await readJsonl(listingFile(adapter.id), ListingItemSchema);
  const resolved = new Map(
    (await readJsonl(itemDocsFile(adapter.id), ItemDocumentsSchema)).map((r) => [r.item_id, r]),
  );
  const selected = selectForDownload(adapter.id, items, max);
  log.info('downloading', { source: adapter.id, selected: selected.length, listed: items.length });
  let ok = 0;
  let failed = 0;
  for (const [index, item] of selected.entries()) {
    try {
      const urls =
        resolved.get(item.item_id)?.document_urls ?? (await resolveAndRecord(adapter, item, ctx));
      for (const url of urls) if (await downloadOne(adapter, url, ctx)) ok++;
    } catch (e) {
      failed++;
      log.warn('item failed', { source: adapter.id, item: item.item_id, error: errorMessage(e) });
    }
    if (index % 50 === 0) log.info('progress', { source: adapter.id, index, ok, failed });
  }
  log.info('downloads done', { source: adapter.id, ok, failed });
}

async function resolveAndRecord(
  adapter: SourceAdapter,
  item: ListingItem,
  ctx: SourceContext,
): Promise<string[]> {
  const urls = await adapter.resolveDocuments(item, ctx);
  const row: ItemDocuments = {
    item_id: item.item_id,
    source_id: adapter.id,
    document_urls: urls,
    resolved_at: new Date().toISOString(),
  };
  await appendJsonl(itemDocsFile(adapter.id), row);
  return urls;
}

async function downloadOne(
  adapter: SourceAdapter,
  url: string,
  ctx: SourceContext,
): Promise<boolean> {
  if (ctx.store.get(url)) return false;
  const res = await ctx.fetcher.fetch(url);
  if (res.status !== 200) {
    log.warn('document not downloaded', { url, status: res.status });
    return false;
  }
  await ctx.store.save(res, adapter.termsNote);
  return true;
}
