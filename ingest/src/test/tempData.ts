import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsBlobStore } from '../storage/fsBlobStore.js';
import { setBlobStore } from '../storage/index.js';

/**
 * Points the pipeline at a fresh temporary data folder for one test file. Call at the top of
 * the file (before anything reads the config): `getConfig()` caches the folder on first use.
 */
export function useTempDataDir(prefix = 'finrakshak-ai-test-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  process.env['FINRAKSHAK_AI_DATA_DIR'] = dir;
  return dir;
}

/** A store on its own temporary folder, installed as the pipeline's store. */
export function freshFsStore(prefix = 'finrakshak-ai-store-'): FsBlobStore {
  const store = new FsBlobStore(mkdtempSync(path.join(tmpdir(), prefix)));
  setBlobStore(store);
  return store;
}

/** A disk store that answers `gs://` URIs, for code that stages files for BigQuery loads. */
export function freshGcsLikeStore(prefix = 'finrakshak-ai-gcs-'): FsBlobStore {
  const store = new (class extends FsBlobStore {
    override uri(key?: string): string | null {
      return `gs://test-state/${key ?? ''}`;
    }
  })(mkdtempSync(path.join(tmpdir(), prefix)));
  setBlobStore(store);
  return store;
}
