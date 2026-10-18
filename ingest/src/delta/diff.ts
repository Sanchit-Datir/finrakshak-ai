import { createHash } from 'node:crypto';
import type { ListingItem } from '@finrakshak-ai/shared';

export interface ListingDelta {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  /** Listed before, absent now, and not already flagged. Never deleted from the listing. */
  readonly removed: readonly string[];
  readonly unchanged: number;
}

/** Hash of the item's content; `listed_at` is excluded so a re-list alone is not a change. */
export function itemFingerprint(item: ListingItem): string {
  const content = [
    item.source_id,
    item.collection,
    item.title,
    item.detail_url,
    item.document_urls,
    item.published_date,
    Object.entries(item.fields).sort(([a], [b]) => a.localeCompare(b)),
  ];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export interface DiffOptions {
  /** True for a full relist; a partial listing cannot say what disappeared. */
  readonly evaluateRemoved: boolean;
  /** Ids already flagged as missing by an earlier run (so they are reported once). */
  readonly alreadyMissing: ReadonlySet<string>;
}

export function diffListings(
  previous: readonly ListingItem[],
  current: readonly ListingItem[],
  options: DiffOptions,
): ListingDelta {
  const before = new Map(previous.map((i) => [i.item_id, itemFingerprint(i)]));
  const now = new Map(current.map((i) => [i.item_id, itemFingerprint(i)]));
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const [id, fingerprint] of now) {
    const old = before.get(id);
    if (old === undefined) added.push(id);
    else if (old !== fingerprint) changed.push(id);
    else unchanged++;
  }
  const removed = options.evaluateRemoved
    ? [...before.keys()].filter((id) => !now.has(id) && !options.alreadyMissing.has(id))
    : [];
  return { added, changed, removed, unchanged };
}

/**
 * Upserts `current` into `previous`. Unchanged items keep their stored record, changed items are
 * replaced in place, new items are appended, and items no longer listed are kept (soft delete).
 */
export function mergeListing(
  previous: readonly ListingItem[],
  current: readonly ListingItem[],
): ListingItem[] {
  const merged = new Map(previous.map((i) => [i.item_id, i]));
  for (const item of current) {
    const old = merged.get(item.item_id);
    if (old === undefined || itemFingerprint(old) !== itemFingerprint(item))
      merged.set(item.item_id, item);
  }
  return [...merged.values()];
}
