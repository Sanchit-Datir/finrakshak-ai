import { errorMessage } from '../log.js';
import type { ToolCall, ToolModel, ToolResult, ToolSpec, Usage } from './toolModel.js';

/**
 * The one tool loop every agent uses (docs/plans/AGENTS_PLAN.md, step 14b): the caps, the per-call
 * validation and the stop rules live here once, so two copies cannot drift apart. What an agent's
 * output must satisfy (wording, proposal caps, numbers) stays in that agent's `accept`.
 */

/** What a tool returns: the reply for the model plus whatever the agent keeps from it. */
export interface LoopOutcome {
  readonly response: Record<string, unknown>;
}

export interface LoopTool<C, O extends LoopOutcome> {
  readonly spec: ToolSpec;
  /** Arguments are untrusted model output: parse with zod; a throw or rejection is reported back. */
  run(args: unknown, ctx: C): Promise<O>;
}

export interface LoopLimits {
  readonly maxToolCalls: number;
  readonly maxInputChars: number;
}

export interface ToolLoopOptions<C, O extends LoopOutcome> {
  readonly system: string;
  readonly user: string;
  readonly tools: readonly LoopTool<C, O>[];
  readonly ctx: C;
  readonly limits: LoopLimits;
  /** Tools that end the agent's work; they stay callable after the input budget is used up. */
  readonly finish: readonly string[];
  /** Name of the finishing tool, for the budget message. */
  readonly finishHint: string;
  /** Checks and keeps an outcome; returns an error for the model (nothing is kept), or null. */
  accept(outcome: O, call: ToolCall): string | null;
  /** True once the agent has what it needs; the loop then stops. */
  done(): boolean;
}

export interface ToolLoopResult {
  readonly toolCalls: number;
  /** Characters the model was given: system, user and every accepted tool reply. */
  readonly inputChars: number;
  readonly usage: Usage;
  /** Why the model could not be used (unavailable, timeout); null when the loop ran. */
  readonly failure: string | null;
}

interface State {
  calls: number;
  chars: number;
}

async function handle<C, O extends LoopOutcome>(
  call: ToolCall,
  opts: ToolLoopOptions<C, O>,
  tools: ReadonlyMap<string, LoopTool<C, O>>,
  state: State,
): Promise<ToolResult> {
  const reply = (response: Record<string, unknown>): ToolResult => ({
    id: call.id,
    name: call.name,
    response,
  });
  const tool = tools.get(call.name);
  if (!tool) return reply({ error: `unknown tool ${call.name}` });
  const finishing = opts.finish.includes(call.name);
  if (!finishing && state.chars > opts.limits.maxInputChars)
    return reply({ error: `input budget used up: call ${opts.finishHint} now` });
  try {
    const out = await tool.run(call.args, opts.ctx);
    const refused = opts.accept(out, call);
    if (refused !== null) return reply({ error: refused });
    state.chars += JSON.stringify(out.response).length;
    return reply(out.response);
  } catch (e) {
    // Invalid arguments are reported back to the model; nothing was executed.
    return reply({ error: errorMessage(e).slice(0, 300) });
  }
}

/**
 * Runs the model until `done()`, the tool-call budget is spent, or the model stops calling tools.
 * Calls past the budget in one reply are dropped. A model failure ends the loop and is returned in
 * `failure`; the caller falls back to its templated result.
 */
export async function runToolLoop<C, O extends LoopOutcome>(
  model: ToolModel,
  opts: ToolLoopOptions<C, O>,
): Promise<ToolLoopResult> {
  const tools = new Map(opts.tools.map((t) => [t.spec.name, t]));
  const state: State = { calls: 0, chars: opts.user.length + opts.system.length };
  const session = model.start(
    opts.system,
    opts.user,
    opts.tools.map((t) => t.spec),
  );
  let results: ToolResult[] = [];
  let failure: string | null = null;
  try {
    while (!opts.done() && state.calls < opts.limits.maxToolCalls) {
      const calls = await session.step(results);
      if (calls.length === 0) break;
      results = [];
      for (const call of calls.slice(0, opts.limits.maxToolCalls - state.calls)) {
        state.calls++;
        results.push(await handle(call, opts, tools, state));
        if (opts.finish.includes(call.name) && opts.done()) break;
      }
    }
  } catch (e) {
    failure = errorMessage(e).slice(0, 200);
  }
  return { toolCalls: state.calls, inputChars: state.chars, usage: session.usage(), failure };
}
