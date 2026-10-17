import { Storage, type Bucket, type File } from '@google-cloud/storage';
import {
  PreconditionFailedError,
  type BlobInfo,
  type BlobRead,
  type BlobStore,
  type Generation,
  type WriteOptions,
} from './blobStore.js';

/** Which bucket holds a key. Raw evidence and published bundles get their own buckets. */
export interface BucketLayout {
  /** Immutable originals: keys `raw/<source>/files/**`. */
  readonly raw: string;
  /** Pipeline state: everything else (listings, manifests, text, processed tables, reports). */
  readonly state: string;
  /** Served bundles: keys `publish/**` (stored without the `publish/` prefix). */
  readonly publish: string;
}

interface Location {
  readonly bucket: string;
  readonly name: string;
}

const RAW_FILE = /^raw\/[^/]+\/files\//;
const PUBLISH = 'publish/';

export function locate(layout: BucketLayout, key: string): Location {
  if (RAW_FILE.test(key)) return { bucket: layout.raw, name: key };
  if (key.startsWith(PUBLISH)) return { bucket: layout.publish, name: key.slice(PUBLISH.length) };
  return { bucket: layout.state, name: key };
}

function httpCode(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null || !('code' in e)) return undefined;
  return typeof e.code === 'number' ? e.code : undefined;
}

/** Retry budget per call (seconds); every request is bounded (CLAUDE.md: timeouts). */
const TOTAL_TIMEOUT_S = 120;

/**
 * Cloud Storage implementation. Uses Application Default Credentials (the job's service account);
 * conditional writes map to `ifGenerationMatch`, so create-only and compare-and-swap are enforced
 * by Cloud Storage itself, not by this process.
 */
export class GcsBlobStore implements BlobStore {
  readonly kind = 'gcs' as const;
  private readonly storage: Storage;

  constructor(
    private readonly layout: BucketLayout,
    options: { readonly projectId?: string; readonly endpoint?: string } = {},
  ) {
    this.storage = new Storage({
      ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
      ...(options.endpoint === undefined ? {} : { apiEndpoint: options.endpoint }),
      retryOptions: { autoRetry: true, maxRetries: 4, totalTimeout: TOTAL_TIMEOUT_S },
    });
  }

  private bucket(name: string): Bucket {
    return this.storage.bucket(name);
  }

  private file(key: string, generation?: Generation): File {
    const { bucket, name } = locate(this.layout, key);
    return generation === undefined
      ? this.bucket(bucket).file(name)
      : this.bucket(bucket).file(name, { generation: Number(generation) });
  }

  async read(key: string): Promise<BlobRead | null> {
    const info = await this.stat(key);
    if (!info) return null;
    try {
      // Download the exact generation we stat'ed, so data and generation always match.
      const [data] = await this.file(key, info.generation).download();
      return { data, generation: info.generation };
    } catch (e) {
      if (httpCode(e) === 404) return null;
      throw new Error(`Could not read ${key}`, { cause: e });
    }
  }

  async stat(key: string): Promise<BlobInfo | null> {
    try {
      const [meta] = await this.file(key).getMetadata();
      return {
        key,
        generation: String(meta.generation),
        size: Number(meta.size ?? 0),
        updated: meta.updated ?? new Date(0).toISOString(),
      };
    } catch (e) {
      if (httpCode(e) === 404) return null;
      throw new Error(`Could not stat ${key}`, { cause: e });
    }
  }

  async write(key: string, data: Buffer | string, options: WriteOptions = {}): Promise<Generation> {
    const condition = options.condition ?? { kind: 'any' };
    const ifGenerationMatch =
      condition.kind === 'absent'
        ? 0
        : condition.kind === 'generation'
          ? Number(condition.generation)
          : undefined;
    const file = this.file(key);
    try {
      await file.save(typeof data === 'string' ? Buffer.from(data) : data, {
        resumable: false,
        ...(ifGenerationMatch === undefined ? {} : { preconditionOpts: { ifGenerationMatch } }),
        metadata: {
          ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
          ...(options.cacheControl === undefined ? {} : { cacheControl: options.cacheControl }),
        },
      });
    } catch (e) {
      if (httpCode(e) === 412) throw new PreconditionFailedError(key, { cause: e });
      throw new Error(`Could not write ${key}`, { cause: e });
    }
    return String(file.metadata.generation);
  }

  async list(prefix: string): Promise<BlobInfo[]> {
    const { bucket, name } = locate(this.layout, prefix.endsWith('/') ? prefix : `${prefix}/`);
    const [files] = await this.bucket(bucket).getFiles({ prefix: name, autoPaginate: true });
    const keyPrefix = bucket === this.layout.publish ? PUBLISH : '';
    return files
      .map((f) => ({
        key: `${keyPrefix}${f.name}`,
        generation: String(f.metadata.generation),
        size: Number(f.metadata.size ?? 0),
        updated: f.metadata.updated ?? new Date(0).toISOString(),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(key: string): Promise<void> {
    try {
      await this.file(key).delete();
    } catch (e) {
      if (httpCode(e) === 404) return;
      throw new Error(`Could not delete ${key}`, { cause: e });
    }
  }

  uri(key: string): string {
    const { bucket, name } = locate(this.layout, key);
    return `gs://${bucket}/${name}`;
  }
}
