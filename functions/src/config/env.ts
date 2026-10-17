import { z } from 'zod';

/** Which backend answers AI requests. Only `apikey` and `vertex` cost money. */
export const GEMINI_PROVIDERS = ['mock', 'apikey', 'vertex'] as const;
export type GeminiProvider = (typeof GEMINI_PROVIDERS)[number];

/**
 * Cost guard: tests and the local emulator never reach a billed model unless
 * GEMINI_PROVIDER is set explicitly (e.g. `npm run serve:live -w functions`).
 * Only a deployed function defaults to the real model.
 */
function defaultProvider(source: NodeJS.ProcessEnv): GeminiProvider {
  const isLocal =
    source['FUNCTIONS_EMULATOR'] === 'true' ||
    source['NODE_ENV'] === 'test' ||
    source['VITEST'] === 'true';
  return isLocal ? 'mock' : 'apikey';
}

const EnvSchema = z.object({
  GCLOUD_PROJECT: z.string().min(1),
  VERTEX_LOCATION: z.string().default('us-central1'),
  /** Cheapest model that handles text tasks; override per environment, see docs/COST_GUIDELINES.md. */
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  GEMINI_PROVIDER: z.enum(GEMINI_PROVIDERS).optional(),
  /** Injected from Secret Manager at runtime (see `geminiApiKey` in config/secrets.ts). */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Bucket the cloud ingestion publishes to (default `<project>-ingest-publish`). */
  PUBLIC_DATA_BUCKET: z.string().min(3).optional(),
  /** `live` for the app; `dry-run` only to inspect the dry run. */
  PUBLIC_DATA_CHANNEL: z.enum(['live', 'dry-run']).default('live'),
});

export type Env = Omit<z.infer<typeof EnvSchema>, 'GEMINI_PROVIDER' | 'PUBLIC_DATA_BUCKET'> & {
  GEMINI_PROVIDER: GeminiProvider;
  PUBLIC_DATA_BUCKET: string;
};

let cached: Env | undefined;

/** Validate env once, fail fast with a clear message. Never read process.env elsewhere. */
export function getEnv(): Env {
  if (cached !== undefined) return cached;
  const raw = EnvSchema.parse(process.env);
  const provider = raw.GEMINI_PROVIDER ?? defaultProvider(process.env);
  if (provider === 'apikey' && raw.GEMINI_API_KEY === undefined) {
    throw new Error('GEMINI_API_KEY is required when GEMINI_PROVIDER=apikey');
  }
  cached = {
    ...raw,
    GEMINI_PROVIDER: provider,
    PUBLIC_DATA_BUCKET: raw.PUBLIC_DATA_BUCKET ?? `${raw.GCLOUD_PROJECT}-ingest-publish`,
  };
  return cached;
}

/** Test helper: drop the cached value so a test can change process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
