import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAiConfig } from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readAiConfig', () => {
  it('defaults to the free mock provider with the agent on and extraction off (B-15, B-52)', () => {
    expect(readAiConfig({})).toEqual({
      provider: 'mock',
      model: 'gemini-3.1-flash-lite',
      location: 'global',
      projectId: undefined,
      apiKey: undefined,
      baseUrl: undefined,
      enabled: true,
      maxToolCalls: 8,
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
      maxInputChars: 60_000,
      extraction: { enabled: false, maxDocs: 50, maxPages: 10, maxChars: 30_000 },
    });
  });

  it('reads process.env when no source is given', () => {
    vi.stubEnv('FUNDTRACE_AI_PROVIDER', 'vertex');
    vi.stubEnv('FUNDTRACE_AI_MODEL', 'gemini-from-env');
    expect(readAiConfig()).toMatchObject({ provider: 'vertex', model: 'gemini-from-env' });
  });

  it('selects Vertex AI without any key, with model, region and project from config (B-17)', () => {
    const cfg = readAiConfig({
      FUNDTRACE_AI_PROVIDER: 'vertex',
      FUNDTRACE_AI_MODEL: 'gemini-x',
      FUNDTRACE_AI_LOCATION: 'asia-south1',
      FUNDTRACE_PROJECT_ID: 'fund-tracker-prod',
    });
    expect(cfg).toMatchObject({
      provider: 'vertex',
      model: 'gemini-x',
      location: 'asia-south1',
      projectId: 'fund-tracker-prod',
      apiKey: undefined,
    });
  });

  it('selects the API-key provider only with a key, and keeps a base URL override', () => {
    expect(() => readAiConfig({ FUNDTRACE_AI_PROVIDER: 'apikey' })).toThrow(
      'GEMINI_API_KEY is required when FUNDTRACE_AI_PROVIDER=apikey',
    );
    const cfg = readAiConfig({
      FUNDTRACE_AI_PROVIDER: 'apikey',
      GEMINI_API_KEY: 'k-123',
      FUNDTRACE_AI_BASE_URL: 'http://127.0.0.1:8089',
    });
    expect(cfg).toMatchObject({
      provider: 'apikey',
      apiKey: 'k-123',
      baseUrl: 'http://127.0.0.1:8089',
    });
  });

  it.each([
    ['an unknown provider', { FUNDTRACE_AI_PROVIDER: 'openai' }],
    ['an empty API key', { FUNDTRACE_AI_PROVIDER: 'apikey', GEMINI_API_KEY: '' }],
    ['an empty model name', { FUNDTRACE_AI_MODEL: '' }],
    ['a base URL that is not a URL', { FUNDTRACE_AI_BASE_URL: 'not a url' }],
    ['a kill switch that is not true/false', { FUNDTRACE_AGENT_ENABLED: 'yes' }],
    ['an extraction switch that is not true/false', { FUNDTRACE_AI_EXTRACT_ENABLED: '1' }],
  ])('rejects %s', (_label, env) => {
    expect(() => readAiConfig(env)).toThrow();
  });

  it('parses the switches from strings', () => {
    const cfg = readAiConfig({
      FUNDTRACE_AGENT_ENABLED: 'false',
      FUNDTRACE_AI_EXTRACT_ENABLED: 'true',
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.extraction.enabled).toBe(true);
  });

  it.each([
    ['FUNDTRACE_AI_MAX_TOOL_CALLS', '1', '20', ['0', '21', '2.5']],
    ['FUNDTRACE_AI_MAX_OUTPUT_TOKENS', '256', '8192', ['255', '8193']],
    ['FUNDTRACE_AI_TIMEOUT_MS', '5000', '120000', ['4999', '120001']],
    ['FUNDTRACE_AI_MAX_INPUT_CHARS', '4000', '400000', ['3999', '400001']],
    ['FUNDTRACE_AI_EXTRACT_MAX_DOCS', '1', '1000', ['0', '1001']],
    ['FUNDTRACE_AI_EXTRACT_MAX_PAGES', '1', '100', ['0', '101']],
    ['FUNDTRACE_AI_EXTRACT_MAX_CHARS', '1000', '200000', ['999', '200001', 'lots']],
  ])('bounds the cost cap %s to [%s, %s] (B-15)', (key, min, max, bad) => {
    expect(() => readAiConfig({ [key]: min })).not.toThrow();
    expect(() => readAiConfig({ [key]: max })).not.toThrow();
    for (const value of bad) expect(() => readAiConfig({ [key]: value })).toThrow();
  });

  it('coerces numeric caps from strings', () => {
    const cfg = readAiConfig({
      FUNDTRACE_AI_MAX_TOOL_CALLS: '3',
      FUNDTRACE_AI_EXTRACT_MAX_DOCS: '7',
      FUNDTRACE_AI_EXTRACT_MAX_PAGES: '2',
      FUNDTRACE_AI_EXTRACT_MAX_CHARS: '5000',
    });
    expect(cfg.maxToolCalls).toBe(3);
    expect(cfg.extraction).toEqual({ enabled: false, maxDocs: 7, maxPages: 2, maxChars: 5000 });
  });
});
