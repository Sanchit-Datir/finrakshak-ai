import { ListingItemSchema, type ListingItem, type SourceId } from '@fund-tracker/shared';
import { z } from 'zod';
import { dataPath, getConfig } from './config.js';
import { diffListings, mergeListing, type ListingDelta } from './delta/diff.js';
import { chooseMode, FULL_PLAN, makePlan } from './delta/policy.js';
import { makeReport, writeReport, type DeltaReport } from './delta/report.js';
import { readState, writeState } from './delta/state.js';
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
    listing: FULL_PLAN,
  };
  return maxItems === undefined ? base : { ...base, maxItems };
}

/**
 * Step 1: list what the source publishes (metadata only), diff it against what we hold and merge it
 * into the stored listing. Nothing is written if the adapter throws or the listing looks broken.
 */
export async function runListing(
  adapter: SourceAdapter,
  ctx: SourceContext,
  forceFull = false,
): Promise<DeltaReport> {
  const file = listingFile(adapter.id);
  const previous = await readJsonl(file, ListingItemSchema);
  const state = await readState(adapter.id);
  const mode = chooseMode(adapter.id, state, ctx.runAt, forceFull);
  const items = validListing(
    adapter.id,
    await adapter.list({ ...ctx, listing: makePlan(mode, previous) }),
  );
  if (mode === 'full' && items.length === 0 && previous.length > 0)
    throw new Error(`${adapter.id} returned no items but ${previous.length} were listed before`);

  const alreadyMissing = new Set(state?.missing_ids ?? []);
  const delta = diffListings(previous, items, { evaluateRemoved: mode === 'full', alreadyMissing });
  const merged = mergeListing(previous, items);
  await writeJsonl(file, merged);
  await writeJsonl(
    dataPath('interim', 'listings', 'history', adapter.id, `${ctx.runAt.slice(0, 10)}.jsonl`),
    items,
  );
  const report = makeReport(adapter.id, ctx.runAt, mode, items.length, merged.length, delta);
  await writeReport(report);
  await writeState({
    source_id: adapter.id,
    last_success_at: ctx.runAt,
    last_full_listing_at: mode === 'full' ? ctx.runAt : (state?.last_full_listing_at ?? null),
    item_count: merged.length,
    missing_ids: nextMissing(merged, items, delta, alreadyMissing),
  });
  log.info('listing saved', {
    source: adapter.id,
    mode,
    fetched: items.length,
    total: merged.length,
  });
  return report;
}

/** Items flagged as missing: kept while still absent from a full relist, cleared when they return. */
function nextMissing(
  merged: readonly ListingItem[],
  fetched: readonly ListingItem[],
  delta: ListingDelta,
  alreadyMissing: ReadonlySet<string>,
): string[] {
  const returned = new Set(fetched.map((i) => i.item_id));
  const exists = new Set(merged.map((i) => i.item_id));
  const missing = new Set([...alreadyMissing, ...delta.removed]);
  for (const id of missing) if (returned.has(id) || !exists.has(id)) missing.delete(id);
  return [...missing].sort();
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
