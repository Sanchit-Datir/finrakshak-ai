import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsBlobStore } from '../storage/fsBlobStore.js';
import { setBlobStore } from '../storage/index.js';

/**
 * Points the pipeline at a fresh temporary data folder for one test file. Call at the top of
 * the file (before anything reads the config): `getConfig()` caches the folder on first use.
 */
export function useTempDataDir(prefix = 'fundtrace-test-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  process.env['FUNDTRACE_DATA_DIR'] = dir;
  return dir;
}

/** A store on its own temporary folder, installed as the pipeline's store. */
export function freshFsStore(prefix = 'fundtrace-store-'): FsBlobStore {
  const store = new FsBlobStore(mkdtempSync(path.join(tmpdir(), prefix)));
  setBlobStore(store);
  return store;
}
