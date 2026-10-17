import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnv, resetEnvCache } from './env.js';

/** Make the process look like a deployed function (not a test run, not the emulator). */
function stubDeployed(): void {
  vi.stubEnv('VITEST', '');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FUNCTIONS_EMULATOR', '');
}

beforeEach(() => {
  resetEnvCache();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('GEMINI_PROVIDER default (cost guard)', () => {
  it('is mock under the test runner', () => {
    expect(getEnv().GEMINI_PROVIDER).toBe('mock');
  });

  it('is mock in the local emulator', () => {
    stubDeployed();
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    expect(getEnv().GEMINI_PROVIDER).toBe('mock');
  });

  it('is the real model only when deployed', () => {
    stubDeployed();
    vi.stubEnv('GEMINI_API_KEY', 'AIza-not-a-real-key');
    expect(getEnv().GEMINI_PROVIDER).toBe('apikey');
  });

  it('can be forced explicitly, e.g. a live local test', () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    vi.stubEnv('GEMINI_PROVIDER', 'vertex');
    expect(getEnv().GEMINI_PROVIDER).toBe('vertex');
  });

  it('fails fast when the real provider has no key', () => {
    stubDeployed();
    vi.stubEnv('GEMINI_API_KEY', undefined);
    expect(() => getEnv()).toThrow(/GEMINI_API_KEY/);
  });
});

describe('model default', () => {
  it('is the cheapest Flash-Lite model, not a full Flash model', () => {
    expect(getEnv().GEMINI_MODEL).toBe('gemini-3.1-flash-lite');
  });
});
