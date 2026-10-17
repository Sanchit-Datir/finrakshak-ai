import { describe, expect, it } from 'vitest';
import type { ToolCall, ToolModel, ToolResult } from '../ai/toolModel.js';
import { ModelError } from '../ai/toolModel.js';
import { RUN_AT, runOf, sourceRecord } from '../test/fixtures.js';
import { assess } from './findings.js';
import type { HistorySource } from './history.js';
import { supervise, templatedSummary } from './supervisor.js';

/** A model that replays scripted steps and records the tool results it was sent. */
function scripted(steps: ToolCall[][], fail?: Error): { model: ToolModel; seen: ToolResult[][] } {
  const seen: ToolResult[][] = [];
  const model: ToolModel = {
    id: 'scripted',
    start: () => {
      let i = 0;
      return {
        step: (results) => {
          seen.push([...results]);
          if (fail) return Promise.reject(fail);
          return Promise.resolve(steps[i++] ?? []);
        },
        usage: () => ({ inputTokens: 0, outputTokens: 0 }),
      };
    },
  };
  return { model, seen };
}
const call = (name: string, args: unknown, id = name): ToolCall => ({ id, name, args });
const run = runOf([
  sourceRecord({ source_id: 'ibbi', status: 'failed', mode: null, error: 'listing: fetch failed' }),
]);
const ctx = {
  run,
  assessment: assess(run, new Map(), RUN_AT),
  history: { recent: () => Promise.resolve([]) } satisfies HistorySource,
};
const limits = { maxToolCalls: 8, maxInputChars: 60_000, maxProposals: 2 };
const SUMMARY = 'IBBI could not be reached today; it will be retried once automatically.';

describe('supervise (agent tool loop, B-49)', () => {
  it('ends on a valid submit_review and keeps model proposals', async () => {
    const { model } = scripted([
      [call('get_run_summary', {})],
      [
        call('propose_action', {
          source_id: 'ibbi',
          action: 'full_relist',
          reason: 'Quiet for days; check nothing is missed.',
        }),
        call('submit_review', { summary: SUMMARY }),
      ],
    ]);
    const out = await supervise(model, ctx, limits);
    expect(out).toMatchObject({ summary: SUMMARY, toolCalls: 3, note: null });
    expect(out.drafts).toEqual([expect.objectContaining({ action: 'full_relist', auto: false })]);
  });

  it('reports unknown tools and invalid arguments back without executing anything', async () => {
    const { model, seen } = scripted([
      [
        call('fetch_url', { url: 'https://evil' }),
        call('propose_action', { source_id: 'ibbi', action: 'delete_everything', reason: 'x' }),
      ],
      [call('submit_review', { summary: SUMMARY })],
    ]);
    const out = await supervise(model, ctx, limits);
    expect(seen[1]?.map((r) => Object.keys(r.response))).toEqual([['error'], ['error']]);
    expect(out.drafts).toEqual([]);
  });

  it('never lets the model auto-approve, and caps proposals', async () => {
    const p = (source: string): ToolCall =>
      call(
        'propose_action',
        { source_id: source, action: 'rerun_source', reason: 'Please retry this source now.' },
        source,
      );
    const { model } = scripted([
      [p('ibbi'), p('nfra'), p('sfio')],
      [call('submit_review', { summary: SUMMARY })],
    ]);
    const out = await supervise(model, ctx, limits);
    expect(out.drafts.map((d) => [d.source_id, d.auto])).toEqual([
      ['ibbi', false],
      ['nfra', false],
    ]);
  });

  it('rejects verdict words in summaries and reasons (leads, never verdicts)', async () => {
    const { model, seen } = scripted([
      [
        call('propose_action', {
          source_id: 'ibbi',
          action: 'full_relist',
          reason: 'The company committed fraud here.',
        }),
      ],
      [
        call('submit_review', {
          summary: 'This borrower is guilty of fraud, block the loan now please.',
        }),
      ],
    ]);
    const out = await supervise(model, ctx, limits);
    expect(out.summary).toBeNull();
    expect(out.drafts).toEqual([]);
    expect(seen[1]?.[0]?.response).toHaveProperty('error');
  });

  it('stops at the tool-call budget and falls back when the model fails', async () => {
    const loop = Array.from({ length: 20 }, () => [call('get_run_summary', {})]);
    const capped = await supervise(scripted(loop).model, ctx, { ...limits, maxToolCalls: 3 });
    expect(capped).toMatchObject({ summary: null, toolCalls: 3 });
    expect(capped.note).toContain('budget');
    const failed = await supervise(scripted([], new ModelError('quota')).model, ctx, limits);
    expect(failed.note).toContain('model unavailable');
  });

  it('refuses further lookups once the input budget is used', async () => {
    const { model, seen } = scripted([
      [call('get_run_summary', {})],
      [call('get_run_summary', {})],
      [call('submit_review', { summary: SUMMARY })],
    ]);
    await supervise(model, ctx, { ...limits, maxInputChars: 10 });
    expect(seen[1]?.[0]?.response).toEqual({
      error: 'input budget used up: call submit_review now',
    });
  });
});

describe('templatedSummary', () => {
  it('states changes, failures, the build and findings in plain words', () => {
    const r = runOf([
      sourceRecord({ source_id: 'sfio', added: 2 }),
      sourceRecord({ source_id: 'ibbi', status: 'failed', error: 'x' }),
    ]);
    const text = templatedSummary(r, assess(r, new Map(), RUN_AT).findings);
    expect(text).toContain('2 sources checked; sfio +2 ~0 -0.');
    expect(text).toContain('Failed: ibbi.');
    expect(text).toContain('Build: dry_run (version v1).');
    expect(text).toContain('need attention: source_failed');
  });
});
