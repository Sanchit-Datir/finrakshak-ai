import { istDate, ListingItemSchema, type ListingItem, type SourceId } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { dataKey, getConfig, SOURCE_MIN_DELAY_MS } from './config.js';
import { diffListings, mergeListing, type ListingDelta } from './delta/diff.js';
import { assertPlausibleListing } from './delta/guards.js';
import { chooseMode, FULL_PLAN, makePlan } from './delta/policy.js';
import { makeReport, writeReport, type DeltaReport } from './delta/report.js';
import { readState, writeState } from './delta/state.js';
import { PoliteFetcher } from './http/fetcher.js';
import { errorMessage, log } from './log.js';
import { selectForDownload } from './select/relevance.js';
import type { SourceAdapter, SourceContext } from './sources/types.js';
import { JsonlAppender, readJsonl, readJsonlVersioned, sameAs, writeJsonl } from './store/jsonl.js';
import type { Generation } from './storage/index.js';
import { RawStore } from './store/rawStore.js';

export const ItemDocumentsSchema = z.object({
  item_id: z.string(),
  source_id: z.string(),
  document_urls: z.array(z.string().url()),
  resolved_at: z.string().datetime(),
});
export type ItemDocuments = z.infer<typeof ItemDocumentsSchema>;

export const listingKey = (s: SourceId): string => dataKey('interim', 'listings', `${s}.jsonl`);
export const itemDocsKey = (s: SourceId): string =>
  dataKey('interim', 'item_documents', `${s}.jsonl`);

export async function makeContext(
  sourceId: SourceId,
  maxItems?: number,
  runAt = new Date().toISOString(),
): Promise<SourceContext> {
  const base = {
    fetcher: new PoliteFetcher({
      ...getConfig(),
      minDelayMs: Math.max(getConfig().minDelayMs, SOURCE_MIN_DELAY_MS[sourceId] ?? 0),
    }),
    store: await RawStore.open(sourceId),
    runAt,
    listing: FULL_PLAN,
  };
  return maxItems === undefined ? base : { ...base, maxItems };
}

export interface ListingOptions {
  /** Ignore the incremental schedule and list everything (`--full`). */
  readonly forceFull?: boolean;
  /** Accept a complete relist that lost most items (`--allow-shrink`). */
  readonly allowShrink?: boolean;
}

/**
 * Step 1: list what the source publishes (metadata only), diff it against what we hold and merge it
 * into the stored listing. Nothing is written if the adapter throws or the listing looks broken.
 */
export async function runListing(
  adapter: SourceAdapter,
  ctx: SourceContext,
  options: ListingOptions = {},
): Promise<DeltaReport> {
  const stored = await readJsonlVersioned(listingKey(adapter.id), ListingItemSchema);
  const previous = stored.value;
  const state = await readState(adapter.id);
  const mode = chooseMode(adapter.id, state, ctx.runAt, options.forceFull ?? false);
  // A capped run (`maxItems`, e.g. the SEBI sample) cannot tell what disappeared from the source.
  const complete = mode === 'full' && ctx.maxItems === undefined;
  const items = validListing(
    adapter.id,
    await adapter.list({ ...ctx, listing: makePlan(mode, previous) }),
  );
  const alreadyMissing = new Set(state?.missing_ids ?? []);
  assertPlausibleListing({
    source: adapter.id,
    fetched: new Set(items.map((i) => i.item_id)).size,
    activeBefore: previous.filter((i) => !alreadyMissing.has(i.item_id)).length,
    complete,
    allowShrink: options.allowShrink ?? false,
  });
  const delta = diffListings(previous, items, { evaluateRemoved: complete, alreadyMissing });
  const merged = mergeListing(previous, items);
  const report = makeReport({
    source: adapter.id,
    runAt: ctx.runAt,
    mode,
    complete,
    fetched: items.length,
    totalAfter: merged.length,
    delta,
  });
  await saveListing(
    { source: adapter.id, runAt: ctx.runAt, merged, fetched: items, report },
    stored.generation,
  );
  await writeState({
    source_id: adapter.id,
    last_success_at: ctx.runAt,
    last_full_listing_at: complete ? ctx.runAt : (state?.last_full_listing_at ?? null),
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

interface ListingWrite {
  readonly source: SourceId;
  readonly runAt: string;
  readonly merged: readonly ListingItem[];
  readonly fetched: readonly ListingItem[];
  readonly report: DeltaReport;
}

/**
 * Writes the merged listing over exactly the version this run read (another writer in between
 * makes the write fail instead of losing its update), then this run's snapshot and delta report.
 * The state watermark is written last, by the caller.
 */
async function saveListing(w: ListingWrite, readAt: Generation | null): Promise<void> {
  await writeJsonl(listingKey(w.source), w.merged, sameAs(readAt));
  await writeJsonl(
    dataKey('interim', 'listings', 'history', w.source, `${istDate(w.runAt)}.jsonl`),
    w.fetched,
  );
  await writeReport(w.report);
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

/**
 * Step 2: download documents for selected items. Already-stored URLs are skipped, except for items in
 * `refresh` (changed in this run's listing): their documents are re-resolved and re-fetched, and a
 * changed file becomes a new manifest version.
 */
export async function runDownloads(
  adapter: SourceAdapter,
  ctx: SourceContext,
  max: number,
  refresh: ReadonlySet<string> = new Set(),
): Promise<void> {
  const items = await readJsonl(listingKey(adapter.id), ListingItemSchema);
  const resolved = new Map(
    (await readJsonl(itemDocsKey(adapter.id), ItemDocumentsSchema)).map((r) => [r.item_id, r]),
  );
  // The cap applies to items that still need work, so a capped daily run keeps moving through a
  // backlog instead of re-selecting the same already-downloaded items (paced backfill, D8).
  const pending = items.filter(
    (i) => refresh.has(i.item_id) || !isComplete(resolved.get(i.item_id), ctx),
  );
  const selected = selectForDownload(adapter.id, pending, max);
  log.info('downloading', {
    source: adapter.id,
    selected: selected.length,
    pending: pending.length,
    listed: items.length,
  });
  const itemDocs = new JsonlAppender(itemDocsKey(adapter.id));
  let ok = 0;
  let failed = 0;
  try {
    for (const [index, item] of selected.entries()) {
      const force = refresh.has(item.item_id);
      try {
        const cached = force ? undefined : resolved.get(item.item_id)?.document_urls;
        const urls = cached ?? (await resolveAndRecord(adapter, item, ctx, itemDocs));
        for (const url of urls) if (await downloadOne(adapter, url, ctx, force)) ok++;
      } catch (e) {
        failed++;
        log.warn('item failed', { source: adapter.id, item: item.item_id, error: errorMessage(e) });
      }
      if (index % 50 === 0) log.info('progress', { source: adapter.id, index, ok, failed });
    }
  } finally {
    // Batched manifest and item→document lines must reach storage even when the loop throws.
    await itemDocs.flush();
    await ctx.store.flush();
  }
  log.info('downloads done', { source: adapter.id, ok, failed });
  if (failed > 0 && ok === 0 && failed === selected.length)
    throw new Error(`${adapter.id}: all ${failed} selected items failed to download`);
}

/** Resolved before and every document already stored (an item with no documents is complete). */
function isComplete(resolved: ItemDocuments | undefined, ctx: SourceContext): boolean {
  return resolved?.document_urls.every((url) => ctx.store.get(url) !== undefined) ?? false;
}

async function resolveAndRecord(
  adapter: SourceAdapter,
  item: ListingItem,
  ctx: SourceContext,
  itemDocs: JsonlAppender,
): Promise<string[]> {
  const urls = await adapter.resolveDocuments(item, ctx);
  const row: ItemDocuments = {
    item_id: item.item_id,
    source_id: adapter.id,
    document_urls: urls,
    resolved_at: new Date().toISOString(),
  };
  await itemDocs.add(row);
  return urls;
}

async function downloadOne(
  adapter: SourceAdapter,
  url: string,
  ctx: SourceContext,
  force: boolean,
): Promise<boolean> {
  if (!force && ctx.store.get(url)) return false;
  const res = await ctx.fetcher.fetch(url);
  if (res.status !== 200) {
    log.warn('document not downloaded', { url, status: res.status });
    return false;
  }
  await ctx.store.save(res, adapter.termsNote);
  return true;
}
