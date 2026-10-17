import type { ListingItem, SourceId } from '@fund-tracker/shared';
import type { ListingPlan } from '../delta/policy.js';
import type { PoliteFetcher } from '../http/fetcher.js';
import type { RawStore } from '../store/rawStore.js';

export interface SourceContext {
  readonly fetcher: PoliteFetcher;
  readonly store: RawStore;
  /** UTC timestamp of this acquisition run. */
  readonly runAt: string;
  /** Stop listing after this many items (e.g. a small SEBI sample); undefined = everything. */
  readonly maxItems?: number;
  /** Full or incremental listing, and the items already held (see `delta/policy.ts`). */
  readonly listing: ListingPlan;
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
