import { describe, expect, it } from 'vitest';
import { readCloudConfig } from './config.js';
import { explainCloudError } from './errors.js';

const FULL = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'fund-tracer.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'fund-tracer',
  VITE_FIREBASE_APP_ID: '1:1:web:1',
};

describe('readCloudConfig', () => {
  it('is null (demo mode) when any required value is missing or empty', () => {
    expect(readCloudConfig({}, false)).toBeNull();
    expect(readCloudConfig({ ...FULL, VITE_FIREBASE_API_KEY: '' }, false)).toBeNull();
    const partial = Object.fromEntries(
      Object.entries(FULL).filter(([key]) => key !== 'VITE_FIREBASE_APP_ID'),
    );
    expect(readCloudConfig(partial, false)).toBeNull();
  });

  it('defaults to the Mumbai region and no App Check key', () => {
    expect(readCloudConfig(FULL, false)).toMatchObject({
      projectId: 'fund-tracer',
      region: 'asia-south1',
      recaptchaSiteKey: null,
      useEmulators: false,
    });
  });

  it('only honours the emulator flag in dev, never in a production build', () => {
    const env = { ...FULL, VITE_USE_EMULATORS: 'true' };
    expect(readCloudConfig(env, true)?.useEmulators).toBe(true);
    expect(readCloudConfig(env, false)?.useEmulators).toBe(false);
  });

  it('reads the optional reCAPTCHA key and region', () => {
    const cfg = readCloudConfig(
      { ...FULL, VITE_RECAPTCHA_SITE_KEY: ' site ', VITE_FUNCTIONS_REGION: 'us-central1' },
      false,
    );
    expect(cfg).toMatchObject({ recaptchaSiteKey: 'site', region: 'us-central1' });
  });
});

describe('explainCloudError', () => {
  it('maps known codes to plain sentences', () => {
    expect(explainCloudError({ code: 'auth/invalid-credential' })).toMatch(/not correct/);
    expect(explainCloudError({ code: 'functions/resource-exhausted' })).toMatch(/allowance/);
  });

  it('never leaks raw error text for unknown errors', () => {
    const message = explainCloudError(new Error('boom: internal path /srv/x'));
    expect(message).toBe('Something went wrong. Try again.');
    expect(explainCloudError('weird')).toBe('Something went wrong. Try again.');
    expect(explainCloudError(null)).toBe('Something went wrong. Try again.');
  });
});
