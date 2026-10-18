import {
  FinishReason,
  FunctionCallingConfigMode,
  type Content,
  type GenerateContentResponse,
} from '@google/genai';
import { getEnv } from '../config/env.js';
import { GeminiError, getClient } from './gemini.js';
import type { ToolCall, ToolModel, ToolResult, ToolSession, ToolSpec } from './tool-model.js';

/** Per-turn bounds for the tool-calling model (B-10, B-11, B-14). */
export const TOOL_MODEL_LIMITS = {
  timeoutMs: 20_000,
  maxOutputTokens: 1_024,
} as const;

class GeminiToolSession implements ToolSession {
  private readonly contents: Content[];

  constructor(
    private readonly system: string,
    user: string,
    private readonly tools: readonly ToolSpec[],
  ) {
    this.contents = [{ role: 'user', parts: [{ text: user }] }];
  }

  async step(results: readonly ToolResult[]): Promise<ToolCall[]> {
    if (results.length > 0)
      this.contents.push({
        role: 'user',
        parts: results.map((r) => ({
          functionResponse: {
            name: r.name,
            response: { ...r.response },
            ...(r.id === undefined ? {} : { id: r.id }),
          },
        })),
      });
    const res = await this.generate();
    // B-11: a reply cut off at the token limit is not a complete answer.
    if (res.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS)
      throw new GeminiError('Model response was cut off');
    const content = res.candidates?.[0]?.content;
    // The model's own content goes back verbatim (keeps Gemini thought signatures intact).
    if (content !== undefined) this.contents.push(content);
    return (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? '', args: c.args }));
  }

  private async generate(): Promise<GenerateContentResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, TOOL_MODEL_LIMITS.timeoutMs);
    try {
      return await getClient().models.generateContent({
        model: getEnv().GEMINI_MODEL,
        contents: this.contents,
        config: {
          systemInstruction: this.system,
          tools: [
            {
              functionDeclarations: this.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parametersJsonSchema: t.parameters,
              })),
            },
          ],
          // Tool calls only: the model cannot answer in free text that would bypass the checks.
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
          maxOutputTokens: TOOL_MODEL_LIMITS.maxOutputTokens,
          temperature: 0,
          abortSignal: controller.signal,
        },
      });
    } catch (cause) {
      throw new GeminiError('Gemini request failed', { cause });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Gemini (Vertex AI by default, or the API key) in forced function-calling mode. */
export function geminiToolModel(): ToolModel {
  const env = getEnv();
  if (env.GEMINI_PROVIDER === 'mock')
    throw new GeminiError('The mock provider has no tool-calling model');
  return {
    id: env.GEMINI_MODEL,
    start: (system, user, tools): ToolSession => new GeminiToolSession(system, user, tools),
  };
}
