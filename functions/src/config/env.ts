import { z } from 'zod';

/** Which backend answers AI requests. Only `apikey` and `vertex` cost money. */
export const GEMINI_PROVIDERS = ['mock', 'apikey', 'vertex'] as const;
export type GeminiProvider = (typeof GEMINI_PROVIDERS)[number];

/**
 * Cost guard: tests and the local emulator never reach a billed model unless
 * GEMINI_PROVIDER is set explicitly (e.g. `npm run serve:live -w functions`).
 * Only a deployed function defaults to the real model.
 */
function isLocal(source: NodeJS.ProcessEnv): boolean {
  return (
    source['FUNCTIONS_EMULATOR'] === 'true' ||
    source['NODE_ENV'] === 'test' ||
    source['VITEST'] === 'true'
  );
}

function defaultProvider(source: NodeJS.ProcessEnv): GeminiProvider {
  return isLocal(source) ? 'mock' : 'apikey';
}

/**
 * Where user profiles come from. Local runs without a Firestore emulator use a built-in dev profile,
 * so the emulator can never read the real project's data by accident. A deployed function always
 * uses Firestore.
 */
export const PROFILE_SOURCES = ['firestore', 'dev'] as const;
export type ProfileSource = (typeof PROFILE_SOURCES)[number];

function defaultProfileSource(source: NodeJS.ProcessEnv): ProfileSource {
  if (source['FIRESTORE_EMULATOR_HOST']) return 'firestore';
  return isLocal(source) ? 'dev' : 'firestore';
}

const EnvSchema = z.object({
  GCLOUD_PROJECT: z.string().min(1),
  VERTEX_LOCATION: z.string().default('us-central1'),
  /** Cheapest model that handles text tasks; override per environment, see docs/COST_GUIDELINES.md. */
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  GEMINI_PROVIDER: z.enum(GEMINI_PROVIDERS).optional(),
  PROFILE_SOURCE: z.enum(PROFILE_SOURCES).optional(),
  /** Billed AI calls each signed-in user may make per Indian calendar day (B-15). */
  GEMINI_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),
  /** Injected from Secret Manager at runtime (see `geminiApiKey` in config/secrets.ts). */
  GEMINI_API_KEY: z.string().min(1).optional(),
});

export type Env = Omit<z.infer<typeof EnvSchema>, 'GEMINI_PROVIDER' | 'PROFILE_SOURCE'> & {
  GEMINI_PROVIDER: GeminiProvider;
  PROFILE_SOURCE: ProfileSource;
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
    PROFILE_SOURCE: raw.PROFILE_SOURCE ?? defaultProfileSource(process.env),
  };
  return cached;
}

/**
 * The profile source on its own. Functions that do not use Gemini (getProfile) must not depend on the
 * Gemini settings being present, so this does not go through getEnv().
 */
export function getProfileSource(): ProfileSource {
  const parsed = z.enum(PROFILE_SOURCES).safeParse(process.env['PROFILE_SOURCE']);
  return parsed.success ? parsed.data : defaultProfileSource(process.env);
}

/** Test helper: drop the cached value so a test can change process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
