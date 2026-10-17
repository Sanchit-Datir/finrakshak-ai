import { describe, expect, it } from 'vitest';
import { buildRecord, RUN_AT, runOf, sourceRecord } from '../test/fixtures.js';
import { assess, baseline, statusOf, type Assessment } from './findings.js';
import type { HistoryRow } from './history.js';

const row = (added: number, over: Partial<HistoryRow> = {}): HistoryRow => ({
  run_id: 'r',
  run_at: '2026-10-16T03:05:00.000Z',
  status: 'ok',
  mode: 'incremental',
  added,
  changed: 0,
  removed: 0,
  duration_ms: 60_000,
  ...over,
});
const busy = baseline([0, 0, 20, 30, 40, 50].map((n) => row(n)));

describe('baseline', () => {
  it('computes mean, spread, quiet streak, median duration and last full relist', () => {
    const b = baseline([
      row(0),
      row(0),
      row(10, { mode: 'full', run_at: '2026-10-10T03:05:00.000Z' }),
      row(20),
      row(5, { status: 'failed' }),
    ]);
    expect(b.runs).toBe(4);
    expect(b.meanNew).toBe(7.5);
    expect(b.quietStreak).toBe(2);
    expect(b.medianDurationMs).toBe(60_000);
    expect(b.lastFullAt).toBe('2026-10-10T03:05:00.000Z');
    expect(baseline([])).toMatchObject({
      runs: 0,
      meanNew: 0,
      sdNew: 0,
      quietStreak: 0,
      lastFullAt: null,
    });
  });
});

describe('assess: failed sources', () => {
  const one = (error: string): Assessment =>
    assess(
      runOf([sourceRecord({ source_id: 'ibbi', status: 'failed', mode: null, error })]),
      new Map(),
      RUN_AT,
    );

  it('retries transient network errors automatically (decided by code, B-49)', () => {
    for (const e of [
      'listing: fetch failed (cause: ECONNRESET)',
      'downloads: HTTP 503',
      'listing: Request timed out',
      'listing: 429 Too Many Requests',
    ])
      expect(one(e).drafts).toEqual([
        expect.objectContaining({ action: 'rerun_source', auto: true }),
      ]);
  });
  it('asks the owner about a shrink and a layout change, never automatically', () => {
    expect(one('listing: ibbi listing shrank from 100 to 10 items').drafts).toEqual([
      expect.objectContaining({ action: 'accept_shrink', auto: false }),
    ]);
    expect(one('listing: No rows parsed from https://x').drafts).toEqual([
      expect.objectContaining({ action: 'adapter_fix_needed', auto: false }),
    ]);
    expect(one('listing: ibbi returned no items but 5 were listed before').drafts[0]?.action).toBe(
      'adapter_fix_needed',
    );
  });
  it('reports a lease conflict as a warning, and an unknown error without a proposal', () => {
    expect(one('lease: Lease acquire-ibbi is held by run_x#0').findings[0]).toMatchObject({
      code: 'lease_conflict',
      severity: 'warn',
    });
    expect(one('listing: TypeError: boom')).toEqual({
      findings: [expect.objectContaining({ code: 'source_failed', severity: 'critical' })],
      drafts: [],
    });
  });
});

describe('assess: successful sources', () => {
  const ok = (over: Parameters<typeof sourceRecord>[0], b = busy): Assessment =>
    assess(runOf([sourceRecord(over)]), new Map([[over.source_id, b]]), RUN_AT);

  it('flags a usually busy source that went quiet, and suggests a full relist', () => {
    const out = ok({ source_id: 'ibbi' });
    expect(out.findings.map((f) => f.code)).toEqual(['no_new_items']);
    expect(out.drafts).toEqual([expect.objectContaining({ action: 'full_relist', auto: false })]);
    expect(ok({ source_id: 'ibbi' }, baseline([row(0), row(0), row(10)])).findings).toEqual([]);
  });
  it('notes spikes, removals, slow runs and unreadable documents', () => {
    const codes = ok({
      source_id: 'ed',
      mode: 'full',
      added: 500,
      removed: 12,
      duration_ms: 20 * 60_000,
      texts_failed: 2,
    }).findings.map((f) => [f.code, f.severity]);
    expect(codes).toEqual([
      ['spike_in_items', 'info'],
      ['items_removed', 'warn'],
      ['slow_source', 'info'],
      ['text_extraction_failed', 'info'],
    ]);
  });
  it('warns when the full relist is overdue, with the IST date (B-27)', () => {
    const b = baseline([row(5, { mode: 'full', run_at: '2026-10-01T20:00:00.000Z' })]);
    const f = ok({ source_id: 'ibbi', added: 3 }, b).findings.find(
      (x) => x.code === 'full_relist_overdue',
    );
    expect(f?.detail).toContain('2026-10-02 (IST)');
    expect(ok({ source_id: 'ed', added: 3 }, b).findings).toEqual([]);
  });
});

describe('assess: build and extraction', () => {
  it('reports missing, failed and gate-failed builds and BigQuery or extraction failures', () => {
    expect(assess(runOf([], null), new Map(), RUN_AT).findings[0]?.code).toBe('build_failed');
    expect(
      assess(runOf([], buildRecord({ status: 'failed', error: 'x' })), new Map(), RUN_AT)
        .findings[0]?.detail,
    ).toBe('x');
    const gate = assess(
      runOf(
        [],
        buildRecord({
          status: 'gate_failed',
          gates: [
            { id: 'bundle_size', passed: false, detail: 'too big' },
            { id: 'ok', passed: true, detail: '' },
          ],
        }),
      ),
      new Map(),
      RUN_AT,
    );
    expect(gate.findings.map((f) => f.code)).toEqual(['gate_failed']);
    const run = {
      ...runOf([], buildRecord({ bigquery: 'failed' })),
      extraction: {
        status: 'failed' as const,
        reason: 'quota',
        model: 'm',
        prompt_version: 'v',
        documents: 0,
        claims: 0,
        failed: 1,
        dropped: 0,
        finished_at: RUN_AT,
      },
    };
    expect(assess(run, new Map(), RUN_AT).findings.map((f) => f.code)).toEqual([
      'bigquery_failed',
      'ai_extraction_failed',
    ]);
  });
});

describe('statusOf', () => {
  it('is failed with any critical finding, degraded with a warning, else healthy', () => {
    expect(statusOf([])).toBe('healthy');
    expect(
      statusOf([{ source_id: null, severity: 'info', code: 'slow_source', detail: 'x' }]),
    ).toBe('healthy');
    expect(
      statusOf([{ source_id: null, severity: 'warn', code: 'slow_source', detail: 'x' }]),
    ).toBe('degraded');
    expect(
      statusOf([
        { source_id: null, severity: 'warn', code: 'slow_source', detail: 'x' },
        { source_id: null, severity: 'critical', code: 'build_failed', detail: 'x' },
      ]),
    ).toBe('failed');
  });
});
