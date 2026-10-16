import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getWebEnv, type WebEnv } from './env.js';

let cached: { app: FirebaseApp; env: WebEnv } | null | undefined;

/**
 * Returns the Firebase app, or null when the web config is missing (local demo
 * mode). App Check (reCAPTCHA v3, free on the Spark plan) is enabled when a
 * site key is configured, so only this site can spend the Gemini quota (B-08).
 */
export function getFirebase(): { app: FirebaseApp; env: WebEnv } | null {
  if (cached !== undefined) return cached;
  const env = getWebEnv();
  if (env === null) {
    cached = null;
    return cached;
  }
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    });
  if (env.VITE_RECAPTCHA_SITE_KEY !== undefined) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  cached = { app, env };
  return cached;
}
