import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnv, getPublicDataConfig, resetEnvCache } from './env.js';

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

describe('getPublicDataConfig', () => {
  it('defaults to the `<project>-ingest-publish` bucket and the live channel', () => {
    expect(getPublicDataConfig()).toEqual({
      bucket: 'fund-tracer-ingest-publish',
      channel: 'live',
      requireAppCheck: true,
    });
  });

  it('uses an explicit bucket and the dry-run channel when set', () => {
    const config = getPublicDataConfig({
      GCLOUD_PROJECT: 'p',
      PUBLIC_DATA_BUCKET: 'my-publish-bucket',
      PUBLIC_DATA_CHANNEL: 'dry-run',
    });
    expect(config.bucket).toBe('my-publish-bucket');
    expect(config.channel).toBe('dry-run');
  });

  it.each(['LIVE', 'prod', 'dryrun', ''])('rejects the unknown channel %j', (channel) => {
    expect(() =>
      getPublicDataConfig({ GCLOUD_PROJECT: 'p', PUBLIC_DATA_CHANNEL: channel }),
    ).toThrow(/PUBLIC_DATA_CHANNEL/);
  });

  it('rejects a bucket name that is too short instead of falling back to the default', () => {
    expect(() => getPublicDataConfig({ GCLOUD_PROJECT: 'p', PUBLIC_DATA_BUCKET: '' })).toThrow(
      /PUBLIC_DATA_BUCKET/,
    );
  });

  it('needs the project id', () => {
    expect(() => getPublicDataConfig({})).toThrow(/GCLOUD_PROJECT/);
  });

  it('turns App Check off only in the local emulator (FUNCTIONS_EMULATOR=true)', () => {
    const appCheck = (env: Record<string, string>): boolean =>
      getPublicDataConfig({ GCLOUD_PROJECT: 'p', ...env }).requireAppCheck;
    expect(appCheck({ FUNCTIONS_EMULATOR: 'true' })).toBe(false);
    expect(appCheck({})).toBe(true);
    expect(appCheck({ FUNCTIONS_EMULATOR: '' })).toBe(true);
    expect(appCheck({ FUNCTIONS_EMULATOR: 'false' })).toBe(true);
    expect(appCheck({ FUNCTIONS_EMULATOR: 'TRUE' })).toBe(true);
    // Unlike the Gemini cost guard, a test run or NODE_ENV=test does not switch App Check off.
    expect(appCheck({ NODE_ENV: 'test', VITEST: 'true' })).toBe(true);
  });

  it('reads FUNCTIONS_EMULATOR from process.env by default', () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    expect(getPublicDataConfig().requireAppCheck).toBe(false);
  });

  it('does not need the Gemini key, even where getEnv() would fail without it', () => {
    stubDeployed();
    vi.stubEnv('GEMINI_API_KEY', undefined);
    expect(() => getEnv()).toThrow(/GEMINI_API_KEY/);
    expect(getPublicDataConfig()).toEqual({
      bucket: 'fund-tracer-ingest-publish',
      channel: 'live',
      requireAppCheck: true,
    });
  });
});
