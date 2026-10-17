import type { SourceId, SourceRunRecord } from '@fund-tracker/shared';
import { LeaseHeldError } from '../coordination/lease.js';
import { reportKey } from '../delta/report.js';
import { extractAllText, type ExtractCounts } from '../extract/runExtract.js';
import { log } from '../log.js';
import {
  acquireSource,
  failure,
  listingResult,
  type AcquireOutcome,
} from '../pipeline/acquireSource.js';
import type { CloudDeps } from './context.js';
import { sourcesForTask, type CloudEnv } from './env.js';

const NO_TEXT: ExtractCounts = { done: 0, failed: 0 };

async function runSource(
  id: SourceId,
  env: CloudEnv,
  deps: CloudDeps,
): Promise<AcquireOutcome & { text: ExtractCounts }> {
  const flags = env.sourceFlags[id] ?? {};
  // One holder per source: parallel tasks or an overlapping execution cannot merge the same listing.
  return deps.leases.withLease(`acquire-${id}`, env.leaseTtlMs, async () => {
    const outcome = await acquireSource(id, {
      runAt: env.runAt,
      forceFull: flags.forceFull ?? false,
      allowShrink: flags.allowShrink ?? false,
    });
    const text = outcome.result.status === 'ok' ? await extractAllText([id]) : NO_TEXT;
    return { ...outcome, text };
  });
}

function toRecord(
  outcome: AcquireOutcome & { text: ExtractCounts },
  env: CloudEnv,
  startedMs: number,
): SourceRunRecord {
  return {
    ...outcome.result,
    run_at: env.runAt,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    texts_extracted: outcome.text.done,
    texts_failed: outcome.text.failed,
    report_key: outcome.report ? reportKey(outcome.result.source_id, env.runAt) : null,
  };
}

async function oneSource(id: SourceId, env: CloudEnv, deps: CloudDeps): Promise<SourceRunRecord> {
  const started = Date.now();
  if (env.sourceFlags[id]?.skip === true) {
    const skipped = { ...listingResult(id, null), status: 'skipped' as const };
    return toRecord({ result: skipped, report: null, text: NO_TEXT }, env, started);
  }
  try {
    return toRecord(await runSource(id, env, deps), env, started);
  } catch (e) {
    const step = e instanceof LeaseHeldError ? 'lease' : 'setup';
    const result = failure(listingResult(id, null), step, e);
    return toRecord({ result, report: null, text: NO_TEXT }, env, started);
  }
}

/**
 * Cloud Run task: acquires the sources assigned to this task index (one per task by default),
 * extracts their new text and records each outcome. Returns false if any source failed, so the
 * task exits non-zero and the execution shows the failure; other sources are unaffected.
 */
export async function runAcquireTask(env: CloudEnv, deps: CloudDeps): Promise<boolean> {
  const mine = sourcesForTask(env.sources, env.taskIndex, env.taskCount);
  log.info('acquire task', { run: env.runId, task: env.taskIndex, sources: mine.join(',') });
  let allOk = true;
  for (const id of mine) {
    const record = await oneSource(id, env, deps);
    await deps.runs.recordSource(env.runId, record);
    log.info('source recorded', { ...record });
    if (record.status === 'failed') allOk = false;
  }
  return allOk;
}
