import type { SourceId } from '@fund-tracker/shared';

/** A complete listing that drops below this share of the items still listed looks broken. */
export const SHRINK_GUARD_MIN_RATIO = 0.5;
/** Below this many listed items a drop is not judged (small sources such as SFIO). */
export const SHRINK_GUARD_MIN_ITEMS = 20;

export interface ListingCheck {
  readonly source: SourceId;
  /** Distinct items the adapter returned this run. */
  readonly fetched: number;
  /** Items held before this run and not already flagged as missing. */
  readonly activeBefore: number;
  /** True when the run listed everything (full mode, no `maxItems` cap). */
  readonly complete: boolean;
  /** Operator confirmed that a large drop is real (`--allow-shrink`). */
  readonly allowShrink: boolean;
}

/**
 * Throws before anything is written when a listing looks broken: no items at all for a source we
 * hold (every mode returns at least its first page), or a complete relist that lost most items.
 */
export function assertPlausibleListing(check: ListingCheck): void {
  const { source, fetched, activeBefore } = check;
  if (activeBefore === 0) return;
  if (fetched === 0)
    throw new Error(`${source} returned no items but ${activeBefore} were listed before`);
  const shrank = fetched < activeBefore * SHRINK_GUARD_MIN_RATIO;
  if (check.complete && !check.allowShrink && activeBefore >= SHRINK_GUARD_MIN_ITEMS && shrank)
    throw new Error(
      `${source} listing shrank from ${activeBefore} to ${fetched} items; check the source and ` +
        're-run with --allow-shrink if the drop is real',
    );
}
