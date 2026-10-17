import type { ListingItem, SourceId } from '@fund-tracker/shared';
import type { SourceState } from './state.js';

export type ListingMode = 'full' | 'incremental';

/** What the adapter is allowed to skip, and what is already known about the source. */
export interface ListingPlan {
  readonly mode: ListingMode;
  readonly known: ReadonlySet<string>;
  readonly knownCollections: ReadonlySet<string>;
}

export const FULL_PLAN: ListingPlan = {
  mode: 'full',
  known: new Set(),
  knownCollections: new Set(),
};

/**
 * Sources that page newest-first run incrementally and do a full relist this often (days) to
 * catch edits and removals. Sources not listed (ED: one call) always list in full.
 */
export const FULL_RELIST_EVERY_DAYS: Readonly<Partial<Record<SourceId, number>>> = {
  ibbi: 7,
  nfra: 7,
  sfio: 7,
  rbi: 30,
  // Full index only (FUNDTRACE_SEBI_SAMPLE=false); the 10-order sample is capped and never incremental.
  sebi: 30,
};

const DAY_MS = 86_400_000;

export function chooseMode(
  source: SourceId,
  state: SourceState | null,
  runAt: string,
  forceFull: boolean,
): ListingMode {
  const every = FULL_RELIST_EVERY_DAYS[source];
  if (forceFull || every === undefined) return 'full';
  const lastFull = state?.last_full_listing_at ?? null;
  if (lastFull === null) return 'full';
  const age = Date.parse(runAt) - Date.parse(lastFull);
  return Number.isNaN(age) || age >= every * DAY_MS ? 'full' : 'incremental';
}

export function makePlan(mode: ListingMode, previous: readonly ListingItem[]): ListingPlan {
  return {
    mode,
    known: new Set(previous.map((i) => i.item_id)),
    knownCollections: new Set(previous.map((i) => i.collection)),
  };
}

/**
 * Incremental listing stops paging once a whole page holds only items we already have. An empty page
 * (an error page or a blip) never counts as "all known", so it cannot end the run early.
 */
export function shouldStopPaging(plan: ListingPlan, pageItemIds: readonly string[]): boolean {
  return (
    plan.mode === 'incremental' &&
    pageItemIds.length > 0 &&
    pageItemIds.every((id) => plan.known.has(id))
  );
}

/** A first page with no rows for a collection we already hold means the page layout changed. */
/** A page no longer parses as the adapter expects; carries the page for diagnosis (MVP 3). */
export class LayoutChangedError extends Error {
  constructor(
    message: string,
    readonly url: string,
    /** The offending HTML, truncated; saved to `interim/diagnostics/` and shown to the agent. */
    readonly page: string | null,
  ) {
    super(message);
    this.name = 'LayoutChangedError';
  }
}

/** Kept in a diagnostic file: enough to see the structure, small enough to store every time. */
export const MAX_DIAGNOSTIC_PAGE_CHARS = 200_000;

export function assertFirstPageHasRows(
  plan: ListingPlan,
  collection: string,
  rowCount: number,
  url: string,
  page?: string,
): void {
  if (rowCount === 0 && plan.knownCollections.has(collection))
    throw new LayoutChangedError(
      `No rows parsed from ${url} although ${collection} was listed before`,
      url,
      page === undefined ? null : page.slice(0, MAX_DIAGNOSTIC_PAGE_CHARS),
    );
}
