import { describe, expect, it } from 'vitest';
import { readCloudConfig } from './config.js';
import { diagnosticReference, explainCloudError } from './errors.js';

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
    expect(explainCloudError({ code: 'functions/permission-denied' })).toMatch(/not enabled/);
  });

  it('tells the burst limit apart from the daily limit, using the server detail', () => {
    const burst = {
      code: 'functions/resource-exhausted',
      details: { reason: 'rate_limit', retryAfterSeconds: 42 },
    };
    expect(explainCloudError(burst)).toBe(
      'You are sending requests too quickly. Wait 42 seconds and try again.',
    );
    expect(
      explainCloudError({
        code: 'functions/resource-exhausted',
        details: { reason: 'rate_limit' },
      }),
    ).toBe('You are sending requests too quickly. Wait a moment and try again.');
    const daily = { code: 'functions/resource-exhausted', details: { reason: 'daily_limit' } };
    expect(explainCloudError(daily)).toMatch(/allowance/);
    // An old server (no details) still gets the daily wording rather than a crash.
    expect(explainCloudError({ code: 'functions/resource-exhausted' })).toMatch(/allowance/);
  });

  it('ignores malformed details instead of failing', () => {
    for (const details of [null, 'text', 42, { reason: 7 }, { retryAfterSeconds: 'soon' }]) {
      expect(() =>
        explainCloudError({ code: 'functions/resource-exhausted', details }),
      ).not.toThrow();
    }
  });

  it('never leaks raw error text for unknown errors', () => {
    const message = explainCloudError(new Error('boom: internal path /srv/x'));
    expect(message).toBe('Something went wrong. Try again.');
    expect(explainCloudError('weird')).toBe('Something went wrong. Try again.');
    expect(explainCloudError(null)).toBe('Something went wrong. Try again.');
  });
});

describe('server failures the person can act on', () => {
  it('explains a profile that could not be loaded, and points to the reference', () => {
    const error = { code: 'functions/internal', details: { reason: 'profile_lookup_failed' } };
    expect(explainCloudError(error)).toMatch(/profile could not be loaded/);
    expect(explainCloudError(error)).toMatch(/reference below/);
  });

  it('explains an access check that failed, and a generic server fault, without raw text', () => {
    expect(
      explainCloudError({
        code: 'functions/internal',
        details: { reason: 'access_lookup_failed' },
      }),
    ).toMatch(/check your access/);
    const generic = explainCloudError({
      code: 'functions/internal',
      message: 'stack trace /srv/x',
    });
    expect(generic).toMatch(/Something went wrong on our side/);
    expect(generic).not.toContain('/srv/x');
  });
});

describe('diagnosticReference', () => {
  const at = new Date('2026-10-17T12:00:00Z');

  it('combines the error code, the server reason and the UTC time', () => {
    const error = { code: 'functions/internal', details: { reason: 'profile_lookup_failed' } };
    expect(diagnosticReference(error, at)).toBe(
      'functions/internal / profile_lookup_failed @ 2026-10-17T12:00:00.000Z',
    );
  });

  it('works without a reason or a code, and never includes the error message text', () => {
    expect(diagnosticReference({ code: 'functions/unauthenticated' }, at)).toBe(
      'functions/unauthenticated @ 2026-10-17T12:00:00.000Z',
    );
    expect(diagnosticReference(new Error('private detail'), at)).toBe(
      'unknown @ 2026-10-17T12:00:00.000Z',
    );
  });
});
