import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GenAi from '@google/genai';
import {
  FunctionCallingConfigMode,
  GenerateContentResponse,
  type Content,
  type GenerateContentParameters,
} from '@google/genai';
import type { AiConfig } from './config.js';
import { GeminiToolModel } from './geminiModel.js';
import { ModelError, type ToolSpec } from './toolModel.js';

/** What the fake SDK saw: client options, and each request with its history copied at call time. */
const sdk = vi.hoisted(() => ({
  clients: [] as unknown[],
  generate: vi.fn<(params: GenerateContentParameters) => Promise<GenerateContentResponse>>(),
}));

vi.mock('@google/genai', async (importOriginal) => {
  const real = await importOriginal<typeof GenAi>();
  class GoogleGenAI {
    readonly models = {
      generateContent: (params: GenerateContentParameters): Promise<GenerateContentResponse> =>
        // The session keeps pushing to the same array: snapshot it so each request is checked as sent.
        sdk.generate({ ...params, contents: structuredClone(params.contents) }),
    };
    constructor(options: unknown) {
      sdk.clients.push(options);
    }
  }
  // Only the client is faked: enums and the response class (its `functionCalls` getter) are real.
  return { ...real, GoogleGenAI };
});

const CFG: AiConfig = {
  provider: 'vertex',
  model: 'gemini-test',
  location: 'global',
  projectId: 'proj-1',
  apiKey: undefined,
  baseUrl: undefined,
  enabled: true,
  maxToolCalls: 8,
  maxOutputTokens: 1024,
  timeoutMs: 5_000,
  maxInputChars: 60_000,
  extraction: { enabled: false, maxDocs: 1, maxPages: 1, maxChars: 1_000 },
};
const TOOLS: readonly ToolSpec[] = [
  { name: 'get_run_summary', description: 'Run summary.', parameters: { type: 'object' } },
  {
    name: 'submit_review',
    description: 'Submit.',
    parameters: { type: 'object', properties: { summary: { type: 'string' } } },
  },
];

function reply(
  content: Content | undefined,
  usage?: { prompt: number; output: number },
): GenerateContentResponse {
  const res = new GenerateContentResponse();
  res.candidates = content ? [{ content }] : [];
  if (usage)
    res.usageMetadata = { promptTokenCount: usage.prompt, candidatesTokenCount: usage.output };
  return res;
}

/** A model turn with a Gemini thought signature, which must go back unchanged. */
const MODEL_TURN: Content = {
  role: 'model',
  parts: [
    {
      functionCall: { id: 'call-1', name: 'get_run_summary', args: {} },
      thoughtSignature: 'sig-1',
    },
    { functionCall: { name: 'submit_review', args: { summary: 'ok' } } },
  ],
};

const request = (n: number): GenerateContentParameters | undefined =>
  sdk.generate.mock.calls[n]?.[0];

beforeEach(() => {
  sdk.clients.length = 0;
  sdk.generate.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GeminiToolModel', () => {
  it('uses Vertex AI with Application Default Credentials (no key) and the model id', () => {
    const model = new GeminiToolModel(CFG);
    expect(model.id).toBe('gemini-test');
    new GeminiToolModel({ ...CFG, projectId: undefined });
    expect(sdk.clients).toEqual([
      { vertexai: true, location: 'global', project: 'proj-1' },
      { vertexai: true, location: 'global' },
    ]);
  });

  it('uses the API key (and a base URL override) only for the apikey provider', () => {
    new GeminiToolModel({ ...CFG, provider: 'apikey', apiKey: 'k-1' });
    new GeminiToolModel({ ...CFG, provider: 'apikey', apiKey: 'k-1', baseUrl: 'http://fake:1' });
    expect(sdk.clients).toEqual([
      { apiKey: 'k-1' },
      { apiKey: 'k-1', httpOptions: { baseUrl: 'http://fake:1' } },
    ]);
    expect(() => new GeminiToolModel({ ...CFG, provider: 'apikey' })).toThrow(ModelError);
  });

  it('sends the tool declarations in forced function-calling mode (ANY)', async () => {
    sdk.generate.mockResolvedValueOnce(reply(MODEL_TURN));
    await new GeminiToolModel(CFG).start('SYSTEM', 'USER', TOOLS).step([]);
    const req = request(0);
    expect(req?.model).toBe('gemini-test');
    expect(req?.contents).toEqual([{ role: 'user', parts: [{ text: 'USER' }] }]);
    expect(req?.config).toMatchObject({
      systemInstruction: 'SYSTEM',
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_run_summary',
              description: 'Run summary.',
              parametersJsonSchema: { type: 'object' },
            },
            {
              name: 'submit_review',
              description: 'Submit.',
              parametersJsonSchema: TOOLS[1]?.parameters,
            },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      maxOutputTokens: 1024,
      temperature: 0,
    });
    expect(req?.config?.toolConfig?.functionCallingConfig?.mode).toBe('ANY');
    expect(req?.config?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('returns the function calls with their ids and untouched args', async () => {
    sdk.generate.mockResolvedValueOnce(reply(MODEL_TURN));
    const calls = await new GeminiToolModel(CFG).start('S', 'U', TOOLS).step([]);
    expect(calls).toEqual([
      { id: 'call-1', name: 'get_run_summary', args: {} },
      { id: undefined, name: 'submit_review', args: { summary: 'ok' } },
    ]);
  });

  it('keeps the model turn verbatim and answers every tool result in a function-response turn', async () => {
    sdk.generate.mockResolvedValueOnce(reply(MODEL_TURN)).mockResolvedValueOnce(reply(undefined));
    const session = new GeminiToolModel(CFG).start('S', 'USER', TOOLS);
    await session.step([]);
    await session.step([
      { id: 'call-1', name: 'get_run_summary', response: { sources: 2 } },
      { id: undefined, name: 'submit_review', response: { error: 'summary too short' } },
    ]);
    expect(request(1)?.contents).toStrictEqual([
      { role: 'user', parts: [{ text: 'USER' }] },
      MODEL_TURN,
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'get_run_summary', response: { sources: 2 }, id: 'call-1' } },
          { functionResponse: { name: 'submit_review', response: { error: 'summary too short' } } },
        ],
      },
    ]);
  });

  it('adds nothing to the history and returns no calls when the reply has no content', async () => {
    sdk.generate.mockResolvedValue(reply(undefined));
    const session = new GeminiToolModel(CFG).start('S', 'USER', TOOLS);
    expect(await session.step([])).toEqual([]);
    await session.step([]);
    expect(request(1)?.contents).toEqual([{ role: 'user', parts: [{ text: 'USER' }] }]);
  });

  it('accumulates token usage across steps (missing metadata counts as zero)', async () => {
    sdk.generate
      .mockResolvedValueOnce(reply(MODEL_TURN, { prompt: 100, output: 20 }))
      .mockResolvedValueOnce(reply(MODEL_TURN))
      .mockResolvedValueOnce(reply(MODEL_TURN, { prompt: 150, output: 5 }));
    const session = new GeminiToolModel(CFG).start('S', 'U', TOOLS);
    expect(session.usage()).toEqual({ inputTokens: 0, outputTokens: 0 });
    for (let i = 0; i < 3; i++) await session.step([]);
    expect(session.usage()).toEqual({ inputTokens: 250, outputTokens: 25 });
  });

  it('turns API errors into ModelError, keeping the cause', async () => {
    const quota = Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 });
    sdk.generate.mockRejectedValueOnce(quota);
    const failure = await new GeminiToolModel(CFG)
      .start('S', 'U', TOOLS)
      .step([])
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ModelError);
    expect(failure).toMatchObject({
      name: 'ModelError',
      message: 'Gemini request failed',
      cause: quota,
    });
  });

  it('aborts a call that outlives the timeout, and clears the timer on success', async () => {
    vi.useFakeTimers();
    sdk.generate.mockImplementationOnce(
      (params) =>
        new Promise((_resolve, reject) => {
          params.config?.abortSignal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const session = new GeminiToolModel(CFG).start('S', 'U', TOOLS);
    const pending = expect(session.step([])).rejects.toBeInstanceOf(ModelError);
    await vi.advanceTimersByTimeAsync(CFG.timeoutMs);
    await pending;

    sdk.generate.mockResolvedValueOnce(reply(MODEL_TURN));
    await session.step([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
