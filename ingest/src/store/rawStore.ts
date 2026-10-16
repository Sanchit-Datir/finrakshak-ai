import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RawArtifactSchema, type RawArtifact, type SourceId } from '@fund-tracker/shared';
import { dataPath } from '../config.js';
import type { FetchResult } from '../http/fetcher.js';
import { appendJsonl, isNotFound, readJsonl } from './jsonl.js';

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

/**
 * Immutable, content-addressed store for raw downloads. Each new (url, checksum)
 * pair appends one manifest line, so changed documents become new versions
 * instead of overwriting history (brief section 6).
 */
export class RawStore {
  private readonly byUrl = new Map<string, RawArtifact>();

  private constructor(
    private readonly sourceId: SourceId,
    private readonly manifestFile: string,
  ) {}

  static async open(sourceId: SourceId): Promise<RawStore> {
    const manifest = dataPath('raw', sourceId, 'manifest.jsonl');
    const store = new RawStore(sourceId, manifest);
    for (const a of await readJsonl(manifest, RawArtifactSchema)) store.byUrl.set(a.url, a);
    return store;
  }

  get(url: string): RawArtifact | undefined {
    return this.byUrl.get(url);
  }

  all(): RawArtifact[] {
    return [...this.byUrl.values()];
  }

  absolutePath(artifact: RawArtifact): string {
    return dataPath(artifact.path);
  }

  async save(res: FetchResult, termsNote: string): Promise<RawArtifact> {
    const digest = sha256(res.body);
    const ext = extensionFor(res.contentType, res.finalUrl);
    const rel = path.join('raw', this.sourceId, 'files', digest.slice(0, 2), `${digest}.${ext}`);
    const abs = dataPath(rel);
    if (!(await exists(abs))) {
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, res.body);
    }
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
      path: rel,
      terms_note: termsNote,
    });
    await appendJsonl(this.manifestFile, artifact);
    this.byUrl.set(res.url, artifact);
    return artifact;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}
