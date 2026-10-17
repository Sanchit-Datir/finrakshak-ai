import { z } from 'zod';

/**
 * Public Firebase web config. None of these values is secret (they identify the project, they do
 * not grant access). When any is missing the app stays in "Not connected" demo mode.
 */
const FirebaseEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
});

export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  /** Cloud Functions region; must match functions/src/callable/*.ts. */
  region: string;
  /** reCAPTCHA Enterprise site key (key ID) for App Check. Required against the deployed backend. */
  recaptchaSiteKey: string | null;
  /** Talk to the local Firebase emulators instead of the real project (dev only). */
  useEmulators: boolean;
}

export function readCloudConfig(env: Record<string, unknown>, isDev: boolean): CloudConfig | null {
  const parsed = FirebaseEnvSchema.safeParse(env);
  if (!parsed.success) return null;
  const optional = (key: string): string | null => {
    const value = env[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };
  return {
    apiKey: parsed.data.VITE_FIREBASE_API_KEY,
    authDomain: parsed.data.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: parsed.data.VITE_FIREBASE_PROJECT_ID,
    appId: parsed.data.VITE_FIREBASE_APP_ID,
    region: optional('VITE_FUNCTIONS_REGION') ?? 'asia-south1',
    recaptchaSiteKey: optional('VITE_RECAPTCHA_SITE_KEY'),
    // Emulators are only ever allowed in `vite dev`, never in a production build.
    useEmulators: isDev && env['VITE_USE_EMULATORS'] === 'true',
  };
}
