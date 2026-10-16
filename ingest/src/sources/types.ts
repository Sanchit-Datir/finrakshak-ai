import type { ListingItem, SourceId } from '@fund-tracker/shared';
import type { PoliteFetcher } from '../http/fetcher.js';
import type { RawStore } from '../store/rawStore.js';

export interface SourceContext {
  readonly fetcher: PoliteFetcher;
  readonly store: RawStore;
  /** UTC timestamp of this acquisition run. */
  readonly runAt: string;
}

/**
 * A source adapter lists every item a source publishes (cheap metadata) and,
 * for selected items, resolves the documents to download.
 */
export interface SourceAdapter {
  readonly id: SourceId;
  /** Recorded on every raw artifact (brief section 6: licence/terms notes). */
  readonly termsNote: string;
  list(ctx: SourceContext): Promise<ListingItem[]>;
  /** Returns document URLs for one item; may fetch & store an intermediate page. */
  resolveDocuments(item: ListingItem, ctx: SourceContext): Promise<string[]>;
}
