import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { log } from '../log.js';

/** A lock older than this is treated as left behind by a crashed run. */
export const LOCK_STALE_MS = 12 * 60 * 60 * 1000;

const LockSchema = z.object({ pid: z.number().int(), started_at: z.string().datetime() });

function isAlreadyExists(e: unknown): boolean {
  return e instanceof Error && 'code' in e && e.code === 'EEXIST';
}

async function tryCreate(file: string, now: Date): Promise<boolean> {
  try {
    const handle = await open(file, 'wx');
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, started_at: now.toISOString() }));
    } finally {
      await handle.close();
    }
    return true;
  } catch (e) {
    if (isAlreadyExists(e)) return false;
    throw new Error(`Could not create lock ${file}`, { cause: e });
  }
}

async function heldSince(file: string): Promise<z.infer<typeof LockSchema> | null> {
  try {
    const parsed = LockSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // unreadable or half-written lock: treat as stale
  }
}

/**
 * Runs `fn` while holding an exclusive lock file, so two `acquire` runs never read-merge-write the
 * same listings at once. A lock older than `LOCK_STALE_MS` (crashed run) is replaced with a warning.
 */
export async function withLock<T>(
  file: string,
  fn: () => Promise<T>,
  now = new Date(),
): Promise<T> {
  await mkdir(path.dirname(file), { recursive: true });
  if (!(await tryCreate(file, now))) {
    const held = await heldSince(file);
    const age = held ? now.getTime() - Date.parse(held.started_at) : Infinity;
    if (held && age < LOCK_STALE_MS)
      throw new Error(
        `Another acquire run (pid ${held.pid}, started ${held.started_at}) holds ${file}; ` +
          'delete the file only if that run is no longer alive',
      );
    log.warn('replacing stale lock', { file, started_at: held?.started_at ?? null });
    await rm(file, { force: true });
    if (!(await tryCreate(file, now))) throw new Error(`Lock ${file} was taken by another run`);
  }
  try {
    return await fn();
  } finally {
    await rm(file, { force: true });
  }
}
