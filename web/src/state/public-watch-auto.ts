import { loadPublicRecords } from '../lib/public-records.js';
import { checkWatch } from '../lib/public-watch.js';
import { recordWatchCheck, syncLoanWatches } from './actions.js';
import { getDb } from './store.js';

/**
 * Automatic post-disbursement watch: every disbursed loan in the loan book is checked against
 * the local public-records dataset as of today, at most once per day. In production a scheduled
 * backend job would do this against a live feed (not built: cloud step on hold).
 */

export interface AutoCheckSummary {
  readonly checked: number;
  readonly newAlerts: number;
}

const today = (): string => new Date().toISOString().slice(0, 10);
let running: Promise<AutoCheckSummary> | null = null;

async function run(actor: string): Promise<AutoCheckSummary> {
  syncLoanWatches(actor);
  const due = getDb().publicWatches.filter(
    (w) => w.loanId !== null && (w.lastCheck === null || w.lastCheck.asOf < today()),
  );
  if (due.length === 0) return { checked: 0, newAlerts: 0 };
  const ix = await loadPublicRecords();
  const now = new Date().toISOString();
  let newAlerts = 0;
  for (const w of due) {
    const result = checkWatch(ix, w, today(), now);
    newAlerts += result.newEvents.length;
    recordWatchCheck(w.id, 'Automatic daily check', {
      ...result,
      datasetBuiltAt: ix.bundle.meta.dataset_built_at,
    });
  }
  return { checked: due.length, newAlerts };
}

/** Runs once at a time; concurrent callers share the same run. */
export function runAutoWatch(actor: string): Promise<AutoCheckSummary> {
  running ??= run(actor).finally(() => {
    running = null;
  });
  return running;
}
