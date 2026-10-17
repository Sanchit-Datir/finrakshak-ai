import type { Finding, IngestRun, SourceId, SourceRunRecord } from '@fund-tracker/shared';
import { FULL_RELIST_EVERY_DAYS } from '../delta/policy.js';
import type { HistoryRow } from './history.js';
import type { ProposalDraft } from './proposals.js';

/** Errors worth one automatic retry: the network or the site, not our code or the data. */
const TRANSIENT =
  /timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|fetch failed|\b5\d\d\b|Too Many Requests|429/i;
const SHRANK = /shrank from (\d+) to (\d+)/;
const LAYOUT = /No rows parsed|returned no items/;

export interface Baseline {
  readonly runs: number;
  readonly meanNew: number;
  readonly sdNew: number;
  /** Consecutive earlier ok runs with nothing new (today not included). */
  readonly quietStreak: number;
  readonly medianDurationMs: number;
  readonly lastFullAt: string | null;
}

const newItems = (r: { added: number; changed: number }): number => r.added + r.changed;

export function baseline(rows: readonly HistoryRow[]): Baseline {
  const ok = rows.filter((r) => r.status === 'ok');
  const counts = ok.map(newItems);
  const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const sd = counts.length
    ? Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length)
    : 0;
  const durations = ok.map((r) => r.duration_ms).sort((a, b) => a - b);
  let quiet = 0;
  for (const r of ok) {
    if (newItems(r) > 0) break;
    quiet++;
  }
  return {
    runs: ok.length,
    meanNew: mean,
    sdNew: sd,
    quietStreak: quiet,
    medianDurationMs: durations[Math.floor(durations.length / 2)] ?? 0,
    lastFullAt: rows.find((r) => r.mode === 'full' && r.status === 'ok')?.run_at ?? null,
  };
}

export interface Assessment {
  readonly findings: Finding[];
  readonly drafts: ProposalDraft[];
}

const finding = (
  source_id: SourceId | null,
  severity: Finding['severity'],
  code: Finding['code'],
  detail: string,
): Finding => ({
  source_id,
  severity,
  code,
  detail: detail.slice(0, 400),
});

function failedSource(s: SourceRunRecord): Assessment {
  const error = s.error ?? 'unknown error';
  if (error.startsWith('lease:'))
    return {
      findings: [
        finding(s.source_id, 'warn', 'lease_conflict', `Another run held the lease: ${error}`),
      ],
      drafts: [],
    };
  const findings = [finding(s.source_id, 'critical', 'source_failed', error)];
  const shrink = SHRANK.exec(error);
  if (shrink)
    return {
      findings,
      drafts: [
        {
          source_id: s.source_id,
          action: 'accept_shrink',
          auto: false,
          reason: `Listing shrank from ${shrink[1] ?? '?'} to ${shrink[2] ?? '?'} items. Check the site; approve only if the drop is real.`,
        },
      ],
    };
  if (LAYOUT.test(error))
    return {
      findings,
      drafts: [
        {
          source_id: s.source_id,
          action: 'adapter_fix_needed',
          auto: false,
          reason: `The page no longer parses as expected (${error.slice(0, 200)}). The adapter likely needs a selector change.`,
        },
      ],
    };
  if (TRANSIENT.test(error))
    return {
      findings,
      drafts: [
        {
          source_id: s.source_id,
          action: 'rerun_source',
          auto: true,
          reason: `Transient error, retried once automatically: ${error.slice(0, 200)}`,
        },
      ],
    };
  return { findings, drafts: [] };
}

function okSource(s: SourceRunRecord, b: Baseline, runAt: string): Assessment {
  const findings: Finding[] = [];
  const drafts: ProposalDraft[] = [];
  const today = newItems(s);
  if (today === 0 && b.runs >= 5 && b.meanNew >= 5 && b.quietStreak >= 2)
    findings.push(
      finding(
        s.source_id,
        'warn',
        'no_new_items',
        `Nothing new for ${b.quietStreak + 1} runs; usually about ${Math.round(b.meanNew)} per run.`,
      ),
    );
  if (
    today === 0 &&
    b.runs >= 5 &&
    b.meanNew >= 5 &&
    b.quietStreak >= 2 &&
    s.mode === 'incremental'
  )
    drafts.push({
      source_id: s.source_id,
      action: 'full_relist',
      auto: false,
      reason:
        'Several quiet incremental runs on a usually busy source: a full relist checks that nothing is being missed.',
    });
  if (b.runs >= 5 && today > Math.max(50, b.meanNew + 4 * b.sdNew))
    findings.push(
      finding(
        s.source_id,
        'info',
        'spike_in_items',
        `${today} new or changed items; usually about ${Math.round(b.meanNew)}.`,
      ),
    );
  if (s.removed > 0)
    findings.push(
      finding(
        s.source_id,
        s.removed > 10 ? 'warn' : 'info',
        'items_removed',
        `${s.removed} items no longer listed by the source (kept and flagged, never deleted).`,
      ),
    );
  if (
    b.medianDurationMs > 0 &&
    s.duration_ms > 3 * b.medianDurationMs &&
    s.duration_ms > 10 * 60_000
  )
    findings.push(
      finding(
        s.source_id,
        'info',
        'slow_source',
        `Took ${Math.round(s.duration_ms / 60_000)} min; usually ${Math.round(b.medianDurationMs / 60_000)} min.`,
      ),
    );
  if (s.texts_failed > 0)
    findings.push(
      finding(
        s.source_id,
        'info',
        'text_extraction_failed',
        `${s.texts_failed} documents could not be read (scanned PDFs need OCR).`,
      ),
    );
  const every = FULL_RELIST_EVERY_DAYS[s.source_id];
  const lastFull = s.mode === 'full' ? runAt : b.lastFullAt;
  if (
    every !== undefined &&
    lastFull !== null &&
    Date.parse(runAt) - Date.parse(lastFull) > (every + 2) * 86_400_000
  )
    findings.push(
      finding(
        s.source_id,
        'warn',
        'full_relist_overdue',
        `Last full relist ${lastFull.slice(0, 10)}; due every ${every} days.`,
      ),
    );
  return { findings, drafts };
}

function buildFindings(run: IngestRun): Finding[] {
  const b = run.build;
  if (!b)
    return [finding(null, 'critical', 'build_failed', 'The build step did not record a result.')];
  if (b.status === 'failed')
    return [finding(null, 'critical', 'build_failed', b.error ?? 'Build failed.')];
  const out: Finding[] = [];
  if (b.status === 'gate_failed')
    for (const g of b.gates.filter((x) => !x.passed))
      out.push(
        finding(
          null,
          'critical',
          'gate_failed',
          `${g.id}: ${g.detail}. Nothing was published; the previous version stays live.`,
        ),
      );
  if (b.bigquery === 'failed')
    out.push(finding(null, 'warn', 'bigquery_failed', b.error ?? 'BigQuery load failed.'));
  return out;
}

/** Pure, deterministic assessment of one run: what the code knows before any model is asked. */
export function assess(
  run: IngestRun,
  baselines: ReadonlyMap<SourceId, Baseline>,
  runAt: string,
): Assessment {
  const parts = Object.values(run.sources).map((s) => {
    if (s.status === 'failed') return failedSource(s);
    if (s.status === 'skipped') return { findings: [], drafts: [] };
    return okSource(s, baselines.get(s.source_id) ?? baseline([]), runAt);
  });
  return {
    findings: [...parts.flatMap((p) => p.findings), ...buildFindings(run)],
    drafts: parts.flatMap((p) => p.drafts),
  };
}

export function statusOf(findings: readonly Finding[]): 'healthy' | 'degraded' | 'failed' {
  if (findings.some((f) => f.severity === 'critical')) return 'failed';
  if (findings.some((f) => f.severity === 'warn')) return 'degraded';
  return 'healthy';
}
