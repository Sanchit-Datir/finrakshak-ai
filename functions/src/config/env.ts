import { z } from 'zod';

const EnvSchema = z.object({
  GCLOUD_PROJECT: z.string().min(1),
  VERTEX_LOCATION: z.string().default('us-central1'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validate env once, fail fast with a clear message. Never read process.env elsewhere. */
export function getEnv(): Env {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
