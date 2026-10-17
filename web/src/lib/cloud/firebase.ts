import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { readCloudConfig, type CloudConfig } from './config.js';

export interface Cloud {
  config: CloudConfig;
  auth: Auth;
  functions: Functions;
  /** False when no App Check provider could be set up; the deployed backend will then refuse calls. */
  appCheckActive: boolean;
}

/** The connection settings from the build environment, or null when running in demo mode. */
export function cloudConfig(): CloudConfig | null {
  return readCloudConfig(import.meta.env, import.meta.env.DEV);
}

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * The local emulators do not verify App Check, but the callable still requires a token to be
 * present. This unsigned placeholder is only ever used with the emulators (see useEmulators).
 */
function emulatorAppCheckToken(projectId: string): string {
  const header = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64Url(
    JSON.stringify({
      sub: 'emulator',
      aud: [`projects/${projectId}`],
      iss: `https://firebaseappcheck.googleapis.com/${projectId}`,
    }),
  );
  return `${header}.${body}.emulator`;
}

let pending: Promise<Cloud> | undefined;

/**
 * Loads Firebase lazily (the SDK is large, and only needed once someone opens the cloud panel)
 * and sets it up exactly once. No popup/redirect sign-in is configured, so no third-party
 * scripts are loaded for the email + password flow.
 */
export function connectCloud(config: CloudConfig): Promise<Cloud> {
  pending ??= (async (): Promise<Cloud> => {
    const [{ initializeApp }, authLib, fnLib, appCheckLib] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/functions'),
      import('firebase/app-check'),
    ]);
    const app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
    });

    let appCheckActive = false;
    if (config.useEmulators) {
      appCheckLib.initializeAppCheck(app, {
        provider: new appCheckLib.CustomProvider({
          getToken: () =>
            Promise.resolve({
              token: emulatorAppCheckToken(config.projectId),
              expireTimeMillis: Date.now() + 60 * 60 * 1000,
            }),
        }),
      });
      appCheckActive = true;
    } else if (config.recaptchaSiteKey !== null) {
      appCheckLib.initializeAppCheck(app, {
        provider: new appCheckLib.ReCaptchaV3Provider(config.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckActive = true;
    }

    const auth = authLib.initializeAuth(app, {
      persistence: [authLib.indexedDBLocalPersistence, authLib.browserLocalPersistence],
    });
    const functions = fnLib.getFunctions(app, config.region);
    if (config.useEmulators) {
      authLib.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fnLib.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
    return { config, auth, functions, appCheckActive };
  })();
  return pending;
}
