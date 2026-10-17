import { canonicalJson, violatesWording } from '@fund-tracker/shared';
import { numbersOf, unknownNumbers } from '../ai/outputChecks.js';
import { runToolLoop } from '../ai/toolLoop.js';
import type { ToolCall, ToolModel, Usage } from '../ai/toolModel.js';
import { log } from '../log.js';
import type { Candidate, MineResult } from './candidates.js';
import { sha256Hex } from './hash.js';
import { MINE_PROMPT_VERSION, MINE_SYSTEM } from './prompts/mine.js';
import { candidateView, MINER_TOOLS, type MinerContext, type MinerOutcome } from './tools.js';
import { templatedWording, wordingProblem, type PatternWording } from './wording.js';

/**
 * The miner's model step (PATTERN_MINER_PLAN.md, steps 6 and 7): the model words or rejects candidates the
 * code found, through the shared tool loop. Every output is checked here; a rejected output is reported
 * back and nothing of it is kept.
 */

export interface MinerAgentLimits {
  readonly maxToolCalls: number;
  readonly maxInputChars: number;
  /** At most this many proposals per run. */
  readonly maxProposals: number;
}

export interface MinerAgentResult {
  readonly worded: ReadonlyMap<string, PatternWording>;
  readonly rejected: ReadonlyMap<string, string>;
  readonly summary: string | null;
  readonly toolCalls: number;
  readonly usage: Usage;
  readonly note: string | null;
}

/** The code-computed input the model reads; no titles (those come only through the tools). */
export function minerDigest(result: MineResult): Record<string, unknown> {
  return {
    seed_cases: result.seed_cases,
    seeds_with_outcome: result.seeds_with_outcome,
    seeds_with_precursors: result.seeds_with_precursors.length,
    baseline: result.baseline,
    candidate_count: result.candidates.length,
    candidates: result.candidates.map(candidateView),
  };
}

/** sha256 of the digest and prompt version: the same input never needs the model again. */
export const minerInputHash = (result: MineResult): string =>
  sha256Hex(canonicalJson({ prompt: MINE_PROMPT_VERSION, digest: minerDigest(result) }));

interface Kept {
  worded: Map<string, PatternWording>;
  rejected: Map<string, string>;
  summary: string | null;
}

function acceptOutcome(
  out: MinerOutcome,
  ctx: MinerContext,
  kept: Kept,
  rules: { live: ReadonlySet<string>; limits: MinerAgentLimits; allowed: readonly number[] },
): string | null {
  if (out.kind === 'data') return null;
  if (out.kind === 'summary') {
    if (violatesWording(out.summary)) return 'summary uses verdict words; rewrite neutrally';
    if (unknownNumbers(out.summary, rules.allowed).length > 0)
      return 'summary uses numbers the code did not compute';
    kept.summary = out.summary;
    return null;
  }
  const c: Candidate | undefined = ctx.result.candidates.find(
    (x) => x.pattern_id === out.pattern_id,
  );
  if (c === undefined) return `no candidate ${out.pattern_id}; use a pattern_id from the digest`;
  if (kept.worded.has(c.pattern_id) || kept.rejected.has(c.pattern_id))
    return 'this candidate was already decided in this run';
  if (out.kind === 'rejection') {
    if (violatesWording(out.reason)) return 'reason uses verdict words; rewrite neutrally';
    kept.rejected.set(c.pattern_id, out.reason);
    return null;
  }
  if (rules.live.has(c.pattern_id)) return 'this pattern is already in the library';
  if (kept.worded.size >= rules.limits.maxProposals) return 'proposal limit reached';
  const problem = wordingProblem(out.wording, c);
  if (problem !== null) return problem;
  kept.worded.set(c.pattern_id, out.wording);
  return null;
}

/** What the mock "answers": the code's own wording for each candidate, then a summary. */
export function scriptedReview(result: MineResult): ToolCall[] {
  const proposals = result.candidates.map((c, i) => ({
    id: `mock-${i}`,
    name: 'propose_pattern',
    args: { pattern_id: c.pattern_id, ...templatedWording(c) },
  }));
  const summary = `The code found ${result.candidates.length} candidates in ${result.seed_cases} seed cases; each is proposed with templated wording for the owner to review.`;
  return [...proposals, { id: 'mock-summary', name: 'submit_summary', args: { summary } }];
}

export async function reviewCandidates(
  model: ToolModel,
  ctx: MinerContext,
  limits: MinerAgentLimits,
  live: ReadonlySet<string>,
): Promise<MinerAgentResult> {
  const kept: Kept = { worded: new Map(), rejected: new Map(), summary: null };
  const digest = minerDigest(ctx.result);
  const rules = { live, limits, allowed: numbersOf(digest) };
  const loop = await runToolLoop(model, {
    system: MINE_SYSTEM,
    user: JSON.stringify(digest),
    tools: MINER_TOOLS,
    ctx,
    limits,
    finish: ['submit_summary'],
    finishHint: 'submit_summary',
    accept: (out) => acceptOutcome(out, ctx, kept, rules),
    done: () => kept.summary !== null,
  });
  const note =
    loop.failure !== null
      ? `model unavailable: ${loop.failure}`
      : kept.summary === null
        ? 'model did not submit a summary within its budget'
        : null;
  if (loop.failure !== null)
    log.warn('miner model failed; using templated wording', { error: loop.failure });
  log.info('miner loop done', {
    calls: loop.toolCalls,
    inputTokens: loop.usage.inputTokens,
    outputTokens: loop.usage.outputTokens,
    worded: kept.worded.size,
    rejected: kept.rejected.size,
  });
  return { ...kept, toolCalls: loop.toolCalls, usage: loop.usage, note };
}
