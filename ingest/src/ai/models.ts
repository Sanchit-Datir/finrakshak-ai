import type { AiConfig } from './config.js';
import { GeminiToolModel } from './geminiModel.js';
import { MockToolModel } from './mockModel.js';
import type { ToolCall, ToolModel } from './toolModel.js';

/**
 * The model an agent uses: the free mock unless a billed provider is set (mock by default everywhere,
 * B-15). The mock replays `script`, the calls the agent's own code would make, so the whole loop,
 * checks included, runs without a billed call. Its id is null, so nothing it "writes" is ever presented
 * as model output.
 */
export function modelFor(cfg: AiConfig, script: () => readonly ToolCall[]): ToolModel {
  return cfg.provider === 'mock' ? new MockToolModel(script) : new GeminiToolModel(cfg);
}
