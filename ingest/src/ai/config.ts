import { z } from 'zod';

/** Which model backend the agent uses. Only `apikey` and `vertex` cost money (COST_GUIDELINES). */
export const AI_PROVIDERS = ['mock', 'apikey', 'vertex'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

const AiEnvSchema = z.object({
  /** Mock by default everywhere: only the deployed job sets a billed provider explicitly. */
  FUNDTRACE_AI_PROVIDER: z.enum(AI_PROVIDERS).default('mock'),
  FUNDTRACE_AI_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),
  /** Vertex AI location; `global` serves the newest Gemini models. */
  FUNDTRACE_AI_LOCATION: z.string().min(1).default('global'),
  FUNDTRACE_PROJECT_ID: z.string().min(1).optional(),
  /** API base URL override, only for a local fake server (never set in the cloud). */
  FUNDTRACE_AI_BASE_URL: z.string().url().optional(),
  /** Injected from Secret Manager, only for the `apikey` provider. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Kill switch: false = templated reviews only, the model is never called. */
  FUNDTRACE_AGENT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  FUNDTRACE_AI_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(20).default(8),
  FUNDTRACE_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8192).default(2048),
  FUNDTRACE_AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  /** Upper bound on prompt + tool results per run (characters), a hard cost cap. */
  FUNDTRACE_AI_MAX_INPUT_CHARS: z.coerce.number().int().min(4_000).max(400_000).default(60_000),
  /** AI evidence extraction (shadow mode, B-52): off unless switched on, documents/pages/chars capped. */
  FUNDTRACE_AI_EXTRACT_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  FUNDTRACE_AI_EXTRACT_MAX_DOCS: z.coerce.number().int().min(1).max(1_000).default(50),
  FUNDTRACE_AI_EXTRACT_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(10),
  FUNDTRACE_AI_EXTRACT_MAX_CHARS: z.coerce.number().int().min(1_000).max(200_000).default(30_000),
});

export interface AiConfig {
  readonly provider: AiProvider;
  readonly model: string;
  readonly location: string;
  readonly projectId: string | undefined;
  readonly apiKey: string | undefined;
  readonly baseUrl: string | undefined;
  readonly enabled: boolean;
  readonly maxToolCalls: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxInputChars: number;
  readonly extraction: {
    readonly enabled: boolean;
    readonly maxDocs: number;
    readonly maxPages: number;
    readonly maxChars: number;
  };
}

export function readAiConfig(source: NodeJS.ProcessEnv = process.env): AiConfig {
  const env = AiEnvSchema.parse(source);
  if (env.FUNDTRACE_AI_PROVIDER === 'apikey' && env.GEMINI_API_KEY === undefined)
    throw new Error('GEMINI_API_KEY is required when FUNDTRACE_AI_PROVIDER=apikey');
  return {
    provider: env.FUNDTRACE_AI_PROVIDER,
    model: env.FUNDTRACE_AI_MODEL,
    location: env.FUNDTRACE_AI_LOCATION,
    projectId: env.FUNDTRACE_PROJECT_ID,
    apiKey: env.GEMINI_API_KEY,
    baseUrl: env.FUNDTRACE_AI_BASE_URL,
    enabled: env.FUNDTRACE_AGENT_ENABLED,
    maxToolCalls: env.FUNDTRACE_AI_MAX_TOOL_CALLS,
    maxOutputTokens: env.FUNDTRACE_AI_MAX_OUTPUT_TOKENS,
    timeoutMs: env.FUNDTRACE_AI_TIMEOUT_MS,
    maxInputChars: env.FUNDTRACE_AI_MAX_INPUT_CHARS,
    extraction: {
      enabled: env.FUNDTRACE_AI_EXTRACT_ENABLED,
      maxDocs: env.FUNDTRACE_AI_EXTRACT_MAX_DOCS,
      maxPages: env.FUNDTRACE_AI_EXTRACT_MAX_PAGES,
      maxChars: env.FUNDTRACE_AI_EXTRACT_MAX_CHARS,
    },
  };
}
