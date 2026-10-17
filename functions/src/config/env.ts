import { z } from 'zod';

const EnvSchema = z
  .object({
    GCLOUD_PROJECT: z.string().min(1),
    VERTEX_LOCATION: z.string().default('us-central1'),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    /** `apikey` = Gemini Developer API (key from Secret Manager); `vertex` = Vertex AI via ADC. */
    GEMINI_PROVIDER: z.enum(['apikey', 'vertex']).default('apikey'),
    /** Injected from Secret Manager at runtime (see `geminiApiKey` in config/secrets.ts). */
    GEMINI_API_KEY: z.string().min(1).optional(),
  })
  .refine((env) => env.GEMINI_PROVIDER !== 'apikey' || env.GEMINI_API_KEY !== undefined, {
    message: 'GEMINI_API_KEY is required when GEMINI_PROVIDER=apikey',
    path: ['GEMINI_API_KEY'],
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validate env once, fail fast with a clear message. Never read process.env elsewhere. */
export function getEnv(): Env {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
