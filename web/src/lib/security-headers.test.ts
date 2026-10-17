import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import firebase from '../../../firebase.json';
import { BUILD_SECURITY_HEADERS, CONTENT_SECURITY_POLICY } from '../../security-headers.js';

// Firebase Hosting (production) and vite preview must send the same security headers.
const hosting = firebase.hosting.headers[0]?.headers ?? [];
const header = (key: string): string | undefined => hosting.find((h) => h.key === key)?.value;

describe('security headers', () => {
  it('production CSP matches the app CSP (plus upgrade-insecure-requests)', () => {
    expect(header('Content-Security-Policy')).toBe(`${CONTENT_SECURITY_POLICY}; upgrade-insecure-requests`);
  });
  it('production sends every header the preview server sends', () => {
    for (const [key, value] of Object.entries(BUILD_SECURITY_HEADERS))
      if (key !== 'Content-Security-Policy') expect(header(key), key).toBe(value);
  });
  it('blocks framing, plugins and third-party scripts', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
  });
  it('allows only named Google hosts for the cloud features, never wildcards or unsafe-inline scripts', () => {
    const directive = (name: string): string =>
      CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/\*|https:(?!\/\/)|http:/);
    expect(directive('script-src')).not.toContain('unsafe-inline');
    expect(directive('connect-src')).toContain('https://asia-south1-fund-tracer.cloudfunctions.net');
    expect(directive('frame-src')).toBe(
      'frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/',
    );
  });
});

describe('security headers allow what the Firebase libraries really contact', () => {
  // A wrong guess here silently breaks sign-in checks in the browser (the request is blocked, not failed),
  // so read the hosts out of the installed library instead of trusting a hand-written list.
  const source = readFileSync(
    new URL('../../../node_modules/@firebase/app-check/dist/esm/index.esm.js', import.meta.url),
    'utf8',
  );
  const connectSrc =
    CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith('connect-src ')) ?? '';

  it('lets the browser reach every App Check API host the library calls', () => {
    const hosts = [...source.matchAll(/https:\/\/[a-z0-9-]*firebaseappcheck\.googleapis\.com/g)].map(
      (m) => m[0],
    );
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of new Set(hosts)) expect(connectSrc, host).toContain(host);
  });

  it('lets the browser load the reCAPTCHA scripts the library injects', () => {
    const scriptSrc =
      CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith('script-src ')) ?? '';
    const scripts = [...source.matchAll(/https:\/\/www\.google\.com\/recaptcha\/[a-z]+\.js/g)].map(
      (m) => m[0],
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of new Set(scripts)) {
      const prefix = script.slice(0, script.lastIndexOf('/') + 1);
      expect(scriptSrc, script).toContain(prefix);
    }
  });
});
