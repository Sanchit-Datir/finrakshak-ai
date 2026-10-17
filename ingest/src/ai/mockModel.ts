import type { ToolCall, ToolModel, ToolSession } from './toolModel.js';

/**
 * Deterministic stand-in: never touches the network and costs nothing. It replays the calls the
 * caller scripts (the supervisor scripts the review its own rules produced), which exercises the
 * whole tool loop (validation, proposals, persistence) in tests, CI and local runs.
 */
export class MockToolModel implements ToolModel {
  readonly id = null;

  constructor(private readonly script: () => readonly ToolCall[]) {}

  start(): ToolSession {
    let done = false;
    return {
      step: (): Promise<ToolCall[]> => {
        if (done) return Promise.resolve([]);
        done = true;
        return Promise.resolve([...this.script()]);
      },
      usage: () => ({ inputTokens: 0, outputTokens: 0 }),
    };
  }
}
