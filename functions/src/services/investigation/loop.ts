import { GeminiError } from '../gemini.js';
import type { ToolCall, ToolModel, ToolResult, ToolSpec } from '../tool-model.js';

/**
 * Slim tool loop for the investigator, after ingest/src/ai/toolLoop.ts (functions cannot import
 * ingest). Bounds (B-10, B-14, B-67): model turns, read calls, characters of tool replies and a
 * deadline. A reply with arguments that do not parse is reported back once; a second such reply, a
 * cut-off reply or the deadline ends the run as a failure (GeminiError), so no partial result is kept.
 */

export class MalformedArgs extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedArgs';
  }
}

export interface LoopTool {
  readonly spec: ToolSpec;
  /** Reads count against the read budget; submissions have their own caps. */
  readonly read: boolean;
  /** Throws MalformedArgs when the arguments do not parse; nothing has run then. */
  run(args: unknown): Record<string, unknown>;
}

export interface LoopLimits {
  readonly maxTurns: number;
  readonly maxReadCalls: number;
  readonly maxInputChars: number;
  readonly deadlineMs: number;
}

export interface LoopOptions {
  readonly system: string;
  readonly user: string;
  readonly tools: readonly LoopTool[];
  readonly limits: LoopLimits;
  /** True once the model has submitted its summary. */
  finished(): boolean;
  now(): number;
  /**
   * Called before every model call after the first (which the caller already counted); false stops
   * the run there and keeps what was accepted. Used to count each call against the daily limit.
   */
  beforeNextTurn?: () => Promise<boolean>;
}

export interface LoopStats {
  readonly turns: number;
  /** True when beforeNextTurn refused another model call. */
  readonly stoppedEarly: boolean;
  readonly toolCalls: number;
  readonly reads: number;
}

interface State {
  turns: number;
  toolCalls: number;
  reads: number;
  chars: number;
  malformedReplies: number;
}

const BUDGET_USED = 'read budget used up: submit your findings and questions, then submit_summary';

function handle(
  call: ToolCall,
  tools: ReadonlyMap<string, LoopTool>,
  limits: LoopLimits,
  s: State,
): { result: ToolResult; malformed: boolean } {
  const reply = (
    response: Record<string, unknown>,
    malformed = false,
  ): ReturnType<typeof handle> => ({
    result: { id: call.id, name: call.name, response },
    malformed,
  });
  const tool = tools.get(call.name);
  if (tool === undefined) return reply({ error: `unknown tool ${call.name}` }, true);
  if (tool.read && (s.reads >= limits.maxReadCalls || s.chars > limits.maxInputChars))
    return reply({ error: BUDGET_USED });
  try {
    const response = tool.run(call.args);
    if (tool.read) {
      s.reads++;
      s.chars += JSON.stringify(response).length;
    }
    return reply(response);
  } catch (e) {
    if (e instanceof MalformedArgs)
      return reply(
        { error: `arguments not valid (${e.message.slice(0, 200)}); send them once more` },
        true,
      );
    throw e;
  }
}

/** Runs the model until it submits its summary, stops calling tools or a bound is reached. */
export async function runToolLoop(model: ToolModel, opts: LoopOptions): Promise<LoopStats> {
  const tools = new Map(opts.tools.map((t) => [t.spec.name, t]));
  const s: State = { turns: 0, toolCalls: 0, reads: 0, chars: 0, malformedReplies: 0 };
  const start = opts.now();
  const session = model.start(
    opts.system,
    opts.user,
    opts.tools.map((t) => t.spec),
  );
  let results: ToolResult[] = [];
  let stoppedEarly = false;
  while (!opts.finished() && s.turns < opts.limits.maxTurns) {
    if (opts.now() - start > opts.limits.deadlineMs)
      throw new GeminiError('The investigation took too long');
    if (s.turns > 0 && opts.beforeNextTurn !== undefined && !(await opts.beforeNextTurn())) {
      stoppedEarly = true;
      break;
    }
    const calls = await session.step(results);
    s.turns++;
    if (calls.length === 0) break;
    const handled = calls.map((call) => handle(call, tools, opts.limits, s));
    s.toolCalls += calls.length;
    results = handled.map((h) => h.result);
    if (handled.some((h) => h.malformed) && ++s.malformedReplies > 1)
      throw new GeminiError('Model replies were not in the expected shape twice');
  }
  return { turns: s.turns, stoppedEarly, toolCalls: s.toolCalls, reads: s.reads };
}
