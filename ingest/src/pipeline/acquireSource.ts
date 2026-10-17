import type { SourceId } from '@fund-tracker/shared';
import { makeContext, runDownloads, runListing } from '../acquire.js';
import { getConfig, SOURCE_DOC_CAPS, SOURCE_ITEM_CAPS } from '../config.js';
import type { DeltaReport, SourceRunResult } from '../delta/report.js';
import { errorMessage, log } from '../log.js';
import { adapterFor } from './adapters.js';

export interface AcquireOptions {
  /** Shared by every source in one run, so reports line up with the run summary. */
  readonly runAt: string;
  readonly forceFull?: boolean;
  readonly allowShrink?: boolean;
  readonly listOnly?: boolean;
  readonly docsOnly?: boolean;
  /** Documents to download (default: per-source cap, then `FUNDTRACE_MAX_DOCS_PER_SOURCE`). */
  readonly maxDocs?: number;
  /** Listing rows (default: per-source cap such as the SEBI sample). */
  readonly maxItems?: number;
}

export const listingResult = (id: SourceId, report: DeltaReport | null): SourceRunResult => ({
  source_id: id,
  status: 'ok',
  mode: report?.mode ?? null,
  added: report?.added.length ?? 0,
  changed: report?.changed.length ?? 0,
  removed: report?.removed.length ?? 0,
  error: null,
});

export const failure = (result: SourceRunResult, step: string, e: unknown): SourceRunResult => {
  log.error('source failed', { source: result.source_id, step, error: errorMessage(e) });
  return { ...result, status: 'failed', error: `${step}: ${errorMessage(e)}`.slice(0, 500) };
};

export interface AcquireOutcome {
  readonly result: SourceRunResult;
  /** The listing's delta report; null with `docsOnly` or when the listing failed. */
  readonly report: DeltaReport | null;
}

/**
 * One source end to end: listing (diff, guards, merge) then downloads of new and changed
 * documents. Never throws for a source failure: the failed step is recorded in the result.
 */
export async function acquireSource(id: SourceId, opts: AcquireOptions): Promise<AcquireOutcome> {
  const adapter = adapterFor(id);
  const max = opts.maxDocs ?? SOURCE_DOC_CAPS[id] ?? getConfig().maxDocsPerSource;
  const ctx = await makeContext(id, opts.maxItems ?? SOURCE_ITEM_CAPS[id], opts.runAt);
  let report: DeltaReport | null = null;
  try {
    if (opts.docsOnly !== true)
      report = await runListing(adapter, ctx, {
        forceFull: opts.forceFull ?? false,
        allowShrink: opts.allowShrink ?? false,
      });
  } catch (e) {
    return { result: failure(listingResult(id, null), 'listing', e), report: null };
  }
  const result = listingResult(id, report);
  if (opts.listOnly === true) return { result, report };
  try {
    await runDownloads(adapter, ctx, max, new Set(report?.changed ?? []));
    return { result, report };
  } catch (e) {
    return { result: failure(result, 'downloads', e), report };
  }
}
