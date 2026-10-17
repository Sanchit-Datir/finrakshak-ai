import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function freshConfig(): Promise<typeof ConfigModule> {
  vi.resetModules();
  return import('./config.js');
}

describe('ingest config', () => {
  it('defaults to the local disk and the SEBI sample', async () => {
    vi.stubEnv('FUNDTRACE_STORAGE', '');
    const c = await freshConfig();
    vi.unstubAllEnvs();
    const cfg = c.getConfig();
    expect(cfg.storage).toEqual({ kind: 'fs' });
    expect(c.sourceItemCap('sebi')).toBe(10);
    expect(c.sourceDocCap('sebi')).toBe(10);
    expect(c.sourceItemCap('ed')).toBeUndefined();
    expect(c.sourceDocCap('ed')).toBe(cfg.maxDocsPerSource);
    expect(c.dataKey('interim', 'state', 'ed.json')).toBe('interim/state/ed.json');
  });

  it('lists SEBI in full when the sample is switched off', async () => {
    vi.stubEnv('FUNDTRACE_SEBI_SAMPLE', 'false');
    vi.stubEnv('FUNDTRACE_MAX_DOCS_PER_SOURCE', '300');
    const c = await freshConfig();
    expect(c.sourceItemCap('sebi')).toBeUndefined();
    expect(c.sourceDocCap('sebi')).toBe(300);
  });

  it('requires the three buckets for Cloud Storage', async () => {
    vi.stubEnv('FUNDTRACE_STORAGE', 'gcs');
    vi.stubEnv('FUNDTRACE_RAW_BUCKET', 'p-ingest-raw');
    const c = await freshConfig();
    expect(() => c.getConfig()).toThrow(/FUNDTRACE_STATE_BUCKET is required/);
  });

  it('accepts a full Cloud Storage configuration', async () => {
    vi.stubEnv('FUNDTRACE_STORAGE', 'gcs');
    vi.stubEnv('FUNDTRACE_RAW_BUCKET', 'p-raw');
    vi.stubEnv('FUNDTRACE_STATE_BUCKET', 'p-state');
    vi.stubEnv('FUNDTRACE_PUBLISH_BUCKET', 'p-pub');
    vi.stubEnv('FUNDTRACE_PROJECT_ID', 'p');
    const c = await freshConfig();
    expect(c.getConfig().storage).toEqual({
      kind: 'gcs',
      buckets: { raw: 'p-raw', state: 'p-state', publish: 'p-pub' },
      projectId: 'p',
    });
  });

  it('rejects out-of-range pacing (polite crawling, B-35)', async () => {
    vi.stubEnv('FUNDTRACE_MIN_DELAY_MS', '100');
    const c = await freshConfig();
    expect(() => c.getConfig()).toThrow();
  });
});
