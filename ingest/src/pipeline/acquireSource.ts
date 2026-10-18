import type { SourceId } from '@finrakshak-ai/shared';
import { makeContext, runDownloads, runListing } from '../acquire.js';
import { dataKey, sourceDocCap, sourceItemCap } from '../config.js';
import { LayoutChangedError } from '../delta/policy.js';
import { stamp } from '../delta/report.js';
import { blobs } from '../storage/index.js';
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
  /** Documents to download (default: per-source cap, then `FINRAKSHAK_AI_MAX_DOCS_PER_SOURCE`). */
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
  /** Saved page when the listing failed because the layout changed. */
  readonly diagnosticKey?: string | null;
}

export const diagnosticKey = (id: SourceId, runAt: string): string =>
  dataKey('interim', 'diagnostics', stamp(runAt), `${id}.html`);

/** Keeps the page that no longer parses, so the agent (and a developer) can see what changed. */
async function saveDiagnostic(id: SourceId, runAt: string, e: unknown): Promise<string | null> {
  if (!(e instanceof LayoutChangedError) || e.page === null) return null;
  const key = diagnosticKey(id, runAt);
  try {
    await blobs().write(key, e.page, { contentType: 'text/html; charset=utf-8' });
    return key;
  } catch (err) {
    log.warn('could not save diagnostic page', { source: id, error: errorMessage(err) });
    return null;
  }
}

/**
 * One source end to end: listing (diff, guards, merge) then downloads of new and changed
 * documents. Never throws for a source failure: the failed step is recorded in the result.
 */
export async function acquireSource(id: SourceId, opts: AcquireOptions): Promise<AcquireOutcome> {
  const adapter = adapterFor(id);
  const max = opts.maxDocs ?? sourceDocCap(id);
  const ctx = await makeContext(id, opts.maxItems ?? sourceItemCap(id), opts.runAt);
  let report: DeltaReport | null = null;
  try {
    if (opts.docsOnly !== true)
      report = await runListing(adapter, ctx, {
        forceFull: opts.forceFull ?? false,
        allowShrink: opts.allowShrink ?? false,
      });
  } catch (e) {
    const saved = await saveDiagnostic(id, opts.runAt, e);
    return {
      result: failure(listingResult(id, null), 'listing', e),
      report: null,
      diagnosticKey: saved,
    };
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
