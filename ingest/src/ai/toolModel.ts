/**
 * Provider-neutral contract for a model that answers only with tool calls. Each session keeps
 * its own provider-native history (Gemini needs its own content, including thought signatures,
 * sent back verbatim), so callers only exchange tool calls and tool results.
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

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ToolSession {
  /** Sends tool results (none on the first step) and returns the next tool calls. */
  step(results: readonly ToolResult[]): Promise<ToolCall[]>;
  usage(): Usage;
}

export interface ToolModel {
  /** Model id recorded on every review; null for the mock. */
  readonly id: string | null;
  start(system: string, user: string, tools: readonly ToolSpec[]): ToolSession;
}

export class ModelError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ModelError';
  }
}
