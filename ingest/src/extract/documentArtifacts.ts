import {
  ListingItemSchema,
  type ListingItem,
  type RawArtifact,
  type SourceId,
} from '@finrakshak-ai/shared';
import { ItemDocumentsSchema, itemDocsKey, listingKey } from '../acquire.js';
import { readJsonl } from '../store/jsonl.js';
import type { RawStore } from '../store/rawStore.js';

export interface ItemArtifact {
  readonly item: ListingItem;
  readonly url: string;
  readonly artifact: RawArtifact;
}

/**
 * Joins listing items → resolved document URLs → stored artifacts. Intermediate
 * pages (e.g. a SEBI order page that only links to the PDF) are excluded.
 */
export async function documentArtifacts(
  source: SourceId,
  store: RawStore,
): Promise<ItemArtifact[]> {
  const items = new Map(
    (await readJsonl(listingKey(source), ListingItemSchema)).map((i) => [i.item_id, i]),
  );
  const resolved = await readJsonl(itemDocsKey(source), ItemDocumentsSchema);
  const out: ItemArtifact[] = [];
  const seen = new Set<string>();
  for (const row of resolved) {
    const item = items.get(row.item_id);
    if (!item) continue;
    for (const url of row.document_urls) {
      const artifact = store.get(url);
      const key = `${item.item_id}|${url}`;
      if (!artifact || seen.has(key)) continue;
      seen.add(key);
      out.push({ item, url, artifact });
    }
  }
  return out;
}
