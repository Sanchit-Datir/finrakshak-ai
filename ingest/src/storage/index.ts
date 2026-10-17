import { getConfig } from '../config.js';
import type { BlobStore } from './blobStore.js';
import { FsBlobStore } from './fsBlobStore.js';
import { GcsBlobStore } from './gcsBlobStore.js';

export * from './blobStore.js';

let current: BlobStore | undefined;

/** The configured store: local disk by default, Cloud Storage when `FUNDTRACE_STORAGE=gcs`. */
export function blobs(): BlobStore {
  if (current) return current;
  const cfg = getConfig();
  const storage = cfg.storage;
  current =
    storage.kind === 'gcs'
      ? new GcsBlobStore(storage.buckets, {
          ...(storage.projectId === undefined ? {} : { projectId: storage.projectId }),
          ...(storage.endpoint === undefined ? {} : { endpoint: storage.endpoint }),
        })
      : new FsBlobStore(cfg.dataDir);
  return current;
}

/** Replaces the store (tests, or tools that copy between stores). */
export function setBlobStore(store: BlobStore): void {
  current = store;
}
