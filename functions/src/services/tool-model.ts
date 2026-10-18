/**
 * Provider-neutral contract for a model that answers only with tool calls (slim copy of
 * ingest/src/ai/toolModel.ts: functions cannot import ingest at runtime). Each session keeps its own
 * provider-native history, so callers only exchange tool calls and tool results.
 */

/** JSON Schema of a tool's arguments (validated again with zod before any tool runs). */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ToolCall {
  readonly id: string | undefined;
  readonly name: string;
  /** Untrusted model output: parse with the tool's zod schema before use. */
  readonly args: unknown;
}

export interface ToolResult {
  readonly id: string | undefined;
  readonly name: string;
  readonly response: Readonly<Record<string, unknown>>;
}

export interface ToolSession {
  /** Sends tool results (none on the first step) and returns the next tool calls. */
  step(results: readonly ToolResult[]): Promise<ToolCall[]>;
}

export interface ToolModel {
  /** Model id recorded on the result; null for the mock. */
  readonly id: string | null;
  start(system: string, user: string, tools: readonly ToolSpec[]): ToolSession;
}

/**
 * Deterministic stand-in: never touches the network and costs nothing. It replays the calls the
 * caller scripts, then stops, so the whole loop and every check run without a billed call.
 */
export function mockToolModel(script: () => readonly ToolCall[]): ToolModel {
  return {
    id: null,
    start: (): ToolSession => {
      let done = false;
      return {
        step: (): Promise<ToolCall[]> => {
          if (done) return Promise.resolve([]);
          done = true;
          return Promise.resolve([...script()]);
        },
      };
    },
  };
}
