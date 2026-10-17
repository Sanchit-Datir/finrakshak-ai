import { createHash } from 'node:crypto';
import path from 'node:path';
import { RawArtifactSchema, type RawArtifact, type SourceId } from '@fund-tracker/shared';
import { dataKey } from '../config.js';
import type { FetchResult } from '../http/fetcher.js';
import { ABSENT, blobs, PreconditionFailedError } from '../storage/index.js';
import { JsonlAppender, readJsonl } from './jsonl.js';

const EXT_BY_TYPE: readonly (readonly [RegExp, string])[] = [
  [/pdf/i, 'pdf'],
  [/json/i, 'json'],
  [/xml/i, 'xml'],
  [/html/i, 'html'],
  [/jpeg|jpg/i, 'jpg'],
  [/png/i, 'png'],
];

export function extensionFor(contentType: string, url: string): string {
  for (const [re, ext] of EXT_BY_TYPE) if (re.test(contentType)) return ext;
  const fromUrl = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(fromUrl) ? fromUrl : 'bin';
}

export function sha256(body: Buffer | string): string {
  return createHash('sha256').update(body).digest('hex');
}

export const manifestKey = (source: SourceId): string => dataKey('raw', source, 'manifest.jsonl');

/**
 * Immutable, content-addressed store for raw downloads. Each new (url, checksum) pair appends one
 * manifest line, so changed documents become new versions instead of overwriting history (brief
 * section 6). Files are written create-only: an existing checksum is never rewritten. Manifest
 * lines are batched; call `flush()` when a download step ends.
 */
export class RawStore {
  private readonly byUrl = new Map<string, RawArtifact>();
  private readonly manifest: JsonlAppender;

  private constructor(private readonly sourceId: SourceId) {
    this.manifest = new JsonlAppender(manifestKey(sourceId));
  }

  static async open(sourceId: SourceId): Promise<RawStore> {
    const store = new RawStore(sourceId);
    for (const a of await readJsonl(manifestKey(sourceId), RawArtifactSchema))
      store.byUrl.set(a.url, a);
    return store;
  }

  get(url: string): RawArtifact | undefined {
    return this.byUrl.get(url);
  }

  all(): RawArtifact[] {
    return [...this.byUrl.values()];
  }

  /** The stored bytes of an artifact (from disk or Cloud Storage). */
  async body(artifact: RawArtifact): Promise<Buffer> {
    const blob = await blobs().read(artifact.path);
    if (!blob) throw new Error(`Raw file missing for ${artifact.url} (${artifact.path})`);
    return blob.data;
  }

  async save(res: FetchResult, termsNote: string): Promise<RawArtifact> {
    const digest = sha256(res.body);
    const ext = extensionFor(res.contentType, res.finalUrl);
    const key = dataKey('raw', this.sourceId, 'files', digest.slice(0, 2), `${digest}.${ext}`);
    await writeOnce(key, res.body, res.contentType);
    const prior = this.byUrl.get(res.url);
    if (prior?.sha256 === digest) return prior;
    const artifact = RawArtifactSchema.parse({
      sha256: digest,
      source_id: this.sourceId,
      url: res.url,
      final_url: res.finalUrl,
      retrieved_at: new Date().toISOString(),
      http_status: res.status,
      content_type: res.contentType,
      bytes: res.body.length,
      path: key,
      terms_note: termsNote,
    });
    await this.manifest.add(artifact);
    this.byUrl.set(res.url, artifact);
    return artifact;
  }

  /** Writes buffered manifest lines. */
  async flush(): Promise<void> {
    await this.manifest.flush();
  }
}

/** Create-only write: the same checksum already stored (by us or a parallel run) is success. */
async function writeOnce(key: string, body: Buffer, contentType: string): Promise<void> {
  if (await blobs().stat(key)) return;
  try {
    await blobs().write(key, body, { condition: ABSENT, contentType });
  } catch (e) {
    if (!(e instanceof PreconditionFailedError)) throw e;
  }
}
