import { describe, expect, it } from 'vitest';
import { safeExternalUrl, safeInternalPath } from './safe-url.js';

describe('safeExternalUrl', () => {
  it('keeps http(s) links', () => {
    expect(safeExternalUrl('https://ibbi.gov.in/x.pdf')).toBe('https://ibbi.gov.in/x.pdf');
  });
  it('rejects script, data, relative and malformed URLs', () => {
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,<b>', '/local', 'not a url', '', null])
      expect(safeExternalUrl(bad)).toBeNull();
  });
  it('rejects overlong URLs', () => {
    expect(safeExternalUrl(`https://a.in/${'x'.repeat(3000)}`)).toBeNull();
  });
});

describe('safeInternalPath', () => {
  it('allows in-app paths', () => {
    expect(safeInternalPath('/alerts?source=public_records')).toBe('/alerts?source=public_records');
  });
  it('blocks open redirects and loops', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '/login', 42, undefined, '/a\nb'])
      expect(safeInternalPath(bad)).toBe('/dashboard');
  });
});
