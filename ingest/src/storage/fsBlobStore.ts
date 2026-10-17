import {
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  PreconditionFailedError,
  type BlobInfo,
  type BlobRead,
  type BlobStore,
  type Generation,
  type WriteOptions,
} from './blobStore.js';

function isCode(e: unknown, code: string): boolean {
  return e instanceof Error && 'code' in e && e.code === code;
}

const generationOf = (s: { mtimeMs: number; size: number }): Generation =>
  `${Math.trunc(s.mtimeMs * 1000)}-${s.size}`;

/**
 * Local-disk implementation for development and tests. Writes go to a temp file and are renamed
 * into place; create-only writes use `link`, which fails atomically if the target exists.
 */
export class FsBlobStore implements BlobStore {
  readonly kind = 'fs' as const;

  constructor(private readonly root: string) {}

  private file(key: string): string {
    return path.join(this.root, ...key.split('/'));
  }

  async read(key: string): Promise<BlobRead | null> {
    try {
      const file = this.file(key);
      const info = await stat(file);
      return { data: await readFile(file), generation: generationOf(info) };
    } catch (e) {
      if (isCode(e, 'ENOENT')) return null;
      throw new Error(`Could not read ${key}`, { cause: e });
    }
  }

  async stat(key: string): Promise<BlobInfo | null> {
    try {
      const info = await stat(this.file(key));
      if (!info.isFile()) return null;
      return {
        key,
        generation: generationOf(info),
        size: info.size,
        updated: info.mtime.toISOString(),
      };
    } catch (e) {
      if (isCode(e, 'ENOENT')) return null;
      throw e;
    }
  }

  async write(key: string, data: Buffer | string, options: WriteOptions = {}): Promise<Generation> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, data);
    try {
      await this.commit(key, tmp, options);
    } finally {
      await rm(tmp, { force: true });
    }
    const written = await this.stat(key);
    if (!written) throw new Error(`Write of ${key} did not persist`);
    return written.generation;
  }

  private async commit(key: string, tmp: string, options: WriteOptions): Promise<void> {
    const condition = options.condition ?? { kind: 'any' };
    if (condition.kind === 'absent') {
      try {
        await link(tmp, this.file(key));
      } catch (e) {
        if (isCode(e, 'EEXIST')) throw new PreconditionFailedError(key, { cause: e });
        throw e;
      }
      await unlink(tmp);
      return;
    }
    if (condition.kind === 'generation') {
      const current = await this.stat(key);
      if (current?.generation !== condition.generation) throw new PreconditionFailedError(key);
    }
    await rename(tmp, this.file(key));
  }

  async list(prefix: string): Promise<BlobInfo[]> {
    const out: BlobInfo[] = [];
    await this.walk(prefix.replace(/\/+$/, ''), out);
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  private async walk(dirKey: string, out: BlobInfo[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(this.file(dirKey), { withFileTypes: true });
    } catch (e) {
      if (isCode(e, 'ENOENT') || isCode(e, 'ENOTDIR')) return;
      throw e;
    }
    for (const entry of entries) {
      if (entry.name.includes('.tmp-')) continue;
      const key = dirKey.length > 0 ? `${dirKey}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await this.walk(key, out);
      else {
        const info = await this.stat(key);
        if (info) out.push(info);
      }
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }

  uri(): string | null {
    return null;
  }
}
