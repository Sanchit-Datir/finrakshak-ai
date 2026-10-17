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
});
