/**
 * Storage port for every file the pipeline reads or writes. Keys are POSIX paths relative to the
 * data root (`interim/listings/ibbi.jsonl`, `raw/ed/files/ab/<sha>.pdf`), identical on disk and in
 * Cloud Storage, so the layout documented in data/README.md holds in both places.
 */

/** Opaque version token: a Cloud Storage object generation, or mtime + size on disk. */
export type Generation = string;

/**
 * - `absent`: create-only; fails if the key exists (raw evidence is never overwritten).
 * - `generation`: compare-and-swap; fails if the key changed since it was read.
 * - `any`: unconditional write.
 */
export type WriteCondition =
  | { readonly kind: 'absent' }
  | { readonly kind: 'generation'; readonly generation: Generation }
  | { readonly kind: 'any' };

export const ANY: WriteCondition = { kind: 'any' };
export const ABSENT: WriteCondition = { kind: 'absent' };
export const ifGeneration = (generation: Generation): WriteCondition => ({
  kind: 'generation',
  generation,
});

export interface WriteOptions {
  readonly condition?: WriteCondition;
  readonly contentType?: string;
  readonly cacheControl?: string;
}

export interface BlobInfo {
  readonly key: string;
  readonly generation: Generation;
  readonly size: number;
  /** UTC ISO-8601 time of the last write. */
  readonly updated: string;
}

export interface BlobRead {
  readonly data: Buffer;
  readonly generation: Generation;
}

export interface BlobStore {
  readonly kind: 'fs' | 'gcs';
  /** Returns null when the key does not exist. */
  read(key: string): Promise<BlobRead | null>;
  stat(key: string): Promise<BlobInfo | null>;
  /** Writes atomically (readers never see a partial object) and returns the new generation. */
  write(key: string, data: Buffer | string, options?: WriteOptions): Promise<Generation>;
  /** Every key under `prefix` (recursive), in key order. */
  list(prefix: string): Promise<BlobInfo[]>;
  /** Removes a key; a missing key is not an error. */
  delete(key: string): Promise<void>;
  /** A `gs://` URI for services that read objects directly (BigQuery loads); null on disk. */
  uri(key: string): string | null;
}

/** A conditional write lost a race (or a create-only key already exists). */
export class PreconditionFailedError extends Error {
  constructor(
    readonly key: string,
    options?: ErrorOptions,
  ) {
    super(`Precondition failed for ${key}`, options);
    this.name = 'PreconditionFailedError';
  }
}

/** Joins key segments with `/`, rejecting traversal and absolute segments. */
export function joinKey(...parts: readonly string[]): string {
  const segments = parts.flatMap((p) => p.split('/')).filter((s) => s.length > 0);
  if (segments.some((s) => s === '..' || s === '.'))
    throw new Error(`Invalid storage key: ${parts.join('/')}`);
  return segments.join('/');
}
