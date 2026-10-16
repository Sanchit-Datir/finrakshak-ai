import { z } from 'zod';

/**
 * Firebase web config. Every `VITE_*` value is public (B-31) — the Gemini API
 * key itself stays inside Firebase AI Logic and never reaches the bundle.
 */
const WebEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_RECAPTCHA_SITE_KEY: z.string().min(1).optional(),
  VITE_GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
});
export type WebEnv = z.infer<typeof WebEnvSchema>;

/** Empty strings from `.env` files count as "not set". */
function definedEntries(env: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '' && v !== undefined));
}

export function parseWebEnv(env: Record<string, unknown>): WebEnv | null {
  const parsed = WebEnvSchema.safeParse(definedEntries(env));
  return parsed.success ? parsed.data : null;
}

let cachedEnv: WebEnv | null | undefined;

/** Validated web env, or null when the Firebase web config is missing (local demo mode). */
export function getWebEnv(): WebEnv | null {
  cachedEnv ??= parseWebEnv(import.meta.env);
  return cachedEnv;
}

/** True when Gemini extraction can run. Kept free of SDK imports so it costs nothing to call. */
export function aiConfigured(): boolean {
  return getWebEnv() !== null;
}
