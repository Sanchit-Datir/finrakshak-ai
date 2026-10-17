import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type GenerateContentResponse,
} from '@google/genai';
import type { AiConfig } from './config.js';
import {
  ModelError,
  type ToolCall,
  type ToolModel,
  type ToolResult,
  type ToolSession,
  type ToolSpec,
  type Usage,
} from './toolModel.js';

function client(cfg: AiConfig): GoogleGenAI {
  if (cfg.provider === 'vertex')
    // Vertex AI with the job's service account (Application Default Credentials): no key anywhere.
    return new GoogleGenAI({
      vertexai: true,
      location: cfg.location,
      ...(cfg.projectId === undefined ? {} : { project: cfg.projectId }),
    });
  if (cfg.apiKey === undefined) throw new ModelError('Gemini API key is not configured');
  return new GoogleGenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl === undefined ? {} : { httpOptions: { baseUrl: cfg.baseUrl } }),
  });
}

class GeminiSession implements ToolSession {
  private readonly contents: Content[];
  private tokens = { inputTokens: 0, outputTokens: 0 };

  constructor(
    private readonly ai: GoogleGenAI,
    private readonly cfg: AiConfig,
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
            ...(r.id ? { id: r.id } : {}),
          },
        })),
      });
    const res = await this.generate();
    const content = res.candidates?.[0]?.content;
    // The model's own content goes back verbatim (keeps Gemini thought signatures intact).
    if (content) this.contents.push(content);
    const meta = res.usageMetadata;
    this.tokens = {
      inputTokens: this.tokens.inputTokens + (meta?.promptTokenCount ?? 0),
      outputTokens: this.tokens.outputTokens + (meta?.candidatesTokenCount ?? 0),
    };
    return (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? '', args: c.args }));
  }

  private async generate(): Promise<GenerateContentResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.cfg.timeoutMs);
    try {
      return await this.ai.models.generateContent({
        model: this.cfg.model,
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
          // Tool calls only: the model cannot answer in free text that could bypass validation.
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
          maxOutputTokens: this.cfg.maxOutputTokens,
          temperature: 0,
          abortSignal: controller.signal,
        },
      });
    } catch (cause) {
      throw new ModelError('Gemini request failed', { cause });
    } finally {
      clearTimeout(timer);
    }
  }

  usage(): Usage {
    return this.tokens;
  }
}

/** Gemini (API key or Vertex AI) in forced function-calling mode, with a timeout per call. */
export class GeminiToolModel implements ToolModel {
  readonly id: string;
  private readonly ai: GoogleGenAI;

  constructor(private readonly cfg: AiConfig) {
    this.id = cfg.model;
    this.ai = client(cfg);
  }

  start(system: string, user: string, tools: readonly ToolSpec[]): ToolSession {
    return new GeminiSession(this.ai, this.cfg, system, user, tools);
  }
}
