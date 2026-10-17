import { randomUUID } from 'node:crypto';
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
import { setTimeout as sleep } from 'node:timers/promises';
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

/** Inode + nanosecond mtime + size: every committed write (a rename of a new file) changes it. */
const generationOf = (s: { ino: bigint; mtimeNs: bigint; size: bigint }): Generation =>
  `${s.ino}-${s.mtimeNs}-${s.size}`;

const LOCK_RETRY_MS = 5;
const LOCK_TIMEOUT_MS = 10_000;
/** A lock file older than this was left by a crashed process. */
const LOCK_STALE_MS = 30_000;

/** Cross-process lock file (`<file>.lock`, created exclusively), so conditions hold across processes too. */
async function acquireFileLock(lock: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await writeFile(lock, String(process.pid), { flag: 'wx' });
      return;
    } catch (e) {
      if (!isCode(e, 'EEXIST')) throw e;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) await rm(lock, { force: true });
      else if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${lock}`, { cause: e });
      else await sleep(LOCK_RETRY_MS);
    }
  }
}

/**
 * Local-disk implementation for development and tests. Writes go to a temp file and are renamed
 * into place; create-only writes use `link`, which fails atomically if the target exists.
 */
export class FsBlobStore implements BlobStore {
  readonly kind = 'fs' as const;

  /** Per-key queue: writes in this process run one at a time per key. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly root: string) {}

  private async exclusive<T>(file: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const run = previous.then(async () => {
      await acquireFileLock(`${file}.lock`);
      try {
        return await fn();
      } finally {
        await rm(`${file}.lock`, { force: true });
      }
    });
    const settled = run.catch(() => undefined);
    this.queues.set(file, settled);
    try {
      return await run;
    } finally {
      if (this.queues.get(file) === settled) this.queues.delete(file);
    }
  }

  private file(key: string): string {
    return path.join(this.root, ...key.split('/'));
  }

  async read(key: string): Promise<BlobRead | null> {
    try {
      const file = this.file(key);
      const info = await stat(file, { bigint: true });
      return { data: await readFile(file), generation: generationOf(info) };
    } catch (e) {
      if (isCode(e, 'ENOENT')) return null;
      throw new Error(`Could not read ${key}`, { cause: e });
    }
  }

  async stat(key: string): Promise<BlobInfo | null> {
    try {
      const info = await stat(this.file(key), { bigint: true });
      if (!info.isFile()) return null;
      return {
        key,
        generation: generationOf(info),
        size: Number(info.size),
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
    // Unique per write: two writes in the same millisecond must not share a temp file.
    const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(tmp, data);
    try {
      // Check and commit under the key's lock, so a condition cannot go stale in between.
      return await this.exclusive(file, async () => {
        await this.commit(key, tmp, options);
        const written = await this.stat(key);
        if (!written) throw new Error(`Write of ${key} did not persist`);
        return written.generation;
      });
    } finally {
      await rm(tmp, { force: true });
    }
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
      if (entry.name.includes('.tmp-') || entry.name.endsWith('.lock')) continue;
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
