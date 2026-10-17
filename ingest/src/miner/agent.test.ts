import { describe, expect, it } from 'vitest';
import type { ToolCall, ToolModel, ToolResult } from '../ai/toolModel.js';
import { MockToolModel } from '../ai/mockModel.js';
import { minerDigest, minerInputHash, reviewCandidates, scriptedReview } from './agent.js';
import { INJECTED_TITLE, plantedContext } from './testing.js';
import { templatedWording } from './wording.js';

/** A model that replays scripted steps and records the tool results it was sent. */
function scripted(steps: ToolCall[][]): { model: ToolModel; seen: ToolResult[][] } {
  const seen: ToolResult[][] = [];
  const model: ToolModel = {
    id: 'test-model',
    start: () => {
      let i = 0;
      return {
        step: (results) => {
          seen.push([...results]);
          return Promise.resolve(steps[i++] ?? []);
        },
        usage: () => ({ inputTokens: 0, outputTokens: 0 }),
      };
    },
  };
  return { model, seen };
}

const ctx = plantedContext();
const candidate = ctx.result.candidates[0];
if (candidate === undefined) throw new Error('the planted pattern must be found');
const ID = candidate.pattern_id;
const limits = { maxToolCalls: 12, maxInputChars: 60_000, maxProposals: 5 };
const call = (name: string, args: unknown, id = name): ToolCall => ({ id, name, args });
const SUMMARY = 'One candidate was worded for the owner; it rests on 4 seed cases.';
const wording = {
  name: 'ED search, then insolvency',
  description: 'An ED search record, then an insolvency record within 6 months, in 4 seed cases.',
  benign_explanations: ['ED searches often end without any order against the company.'],
};
const propose = (over: Record<string, unknown> = {}, id = 'p'): ToolCall =>
  call('propose_pattern', { pattern_id: ID, ...wording, ...over }, id);

async function review(
  steps: ToolCall[][],
  live: ReadonlySet<string> = new Set(),
  max = limits,
): Promise<{ out: Awaited<ReturnType<typeof reviewCandidates>>; errors: unknown[] }> {
  const { model, seen } = scripted([...steps, [call('submit_summary', { summary: SUMMARY })]]);
  const out = await reviewCandidates(model, ctx, max, live);
  const errors = seen.flat().flatMap((r) => ('error' in r.response ? [r.response['error']] : []));
  return { out, errors };
}

describe('reviewCandidates: the model words what the code found', () => {
  it('keeps valid wording and the summary', async () => {
    const { out, errors } = await review([[call('get_candidate', { pattern_id: ID }), propose()]]);
    expect(errors).toEqual([]);
    expect(out.worded.get(ID)).toEqual(wording);
    expect(out).toMatchObject({ summary: SUMMARY, note: null, toolCalls: 3 });
  });

  it('keeps a rejection with its reason, and nothing else for that candidate', async () => {
    const reject = call('reject_candidate', {
      pattern_id: ID,
      reason: 'It only restates routine filings.',
    });
    const { out, errors } = await review([[reject, propose()]]);
    expect(out.rejected.get(ID)).toBe('It only restates routine filings.');
    expect(out.worded.size).toBe(0);
    expect(errors).toEqual(['this candidate was already decided in this run']);
  });

  it('works with the templated script of the mock', async () => {
    const mock = new MockToolModel(() => scriptedReview(ctx.result));
    const out = await reviewCandidates(mock, ctx, limits, new Set());
    expect(out.worded.get(ID)).toEqual(templatedWording(candidate));
    expect(out.summary).not.toBeNull();
  });
});

describe('reviewCandidates: hostile outputs are rejected (one each)', () => {
  it.each([
    ['an invented candidate', propose({ pattern_id: 'pat_ffffffffffffffff' }), /no candidate/],
    [
      'an edited definition',
      propose({ steps: [{ by: 'kind', value: 'enforcement' }] }),
      /Unrecognized/,
    ],
    [
      'a changed number',
      propose({ description: 'Seen in 5 seed cases, an ED search and then insolvency.' }),
      /did not compute \(5\)/,
    ],
    ['a banned word', propose({ name: 'Fraud ring then insolvency' }), /verdict words/],
    ['an over-long name', propose({ name: 'x'.repeat(81) }), /80/],
  ])('%s', async (_label, bad, message) => {
    const { out, errors } = await review([[bad]]);
    expect(out.worded.size).toBe(0);
    expect(String(errors[0])).toMatch(message);
  });

  it('a duplicate in the run, an excess proposal and a live pattern', async () => {
    const dup = await review([[propose(), propose({}, 'again')]]);
    expect(dup.errors).toEqual(['this candidate was already decided in this run']);
    const capped = await review([[propose()]], new Set(), { ...limits, maxProposals: 0 });
    expect(capped.errors).toEqual(['proposal limit reached']);
    const live = await review([[propose()]], new Set([ID]));
    expect(live.errors).toEqual(['this pattern is already in the library']);
  });

  it('a summary with a verdict word or an invented number', async () => {
    const { model, seen } = scripted([
      [call('submit_summary', { summary: 'The seed companies are criminal enterprises.' })],
      [call('submit_summary', { summary: 'Patterns predict 93 out of 100 defaults correctly.' })],
    ]);
    const out = await reviewCandidates(model, ctx, limits, new Set());
    expect(out.summary).toBeNull();
    expect(seen[1]?.[0]?.response).toHaveProperty('error');
    expect(seen[2]?.[0]?.response).toEqual({
      error: 'summary uses numbers the code did not compute',
    });
    expect(out.note).toContain('budget');
  });
});

describe('injection: titles are data, never instructions (B-16)', () => {
  it('keeps public titles out of the digest and under untrusted_data in the tools', async () => {
    expect(JSON.stringify(minerDigest(ctx.result))).not.toContain('IGNORE');
    const { model, seen } = scripted([
      [call('get_case_timeline', { case_id: 's1' })],
      [call('submit_summary', { summary: SUMMARY })],
    ]);
    const out = await reviewCandidates(model, ctx, limits, new Set());
    const reply = seen[1]?.[0]?.response;
    expect(reply).toMatchObject({ untrusted_data: { titles: [INJECTED_TITLE, 'Order about s1'] } });
    expect(out.worded.size).toBe(0);
  });

  it('gives a stable input hash that changes with the candidates', () => {
    expect(minerInputHash(ctx.result)).toBe(minerInputHash(plantedContext().result));
    expect(minerInputHash({ ...ctx.result, candidates: [] })).not.toBe(minerInputHash(ctx.result));
  });
});
