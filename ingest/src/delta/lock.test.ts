import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCK_STALE_MS, withLock } from './lock.js';

const lockFile = (): string =>
  path.join(mkdtempSync(path.join(tmpdir(), 'finrakshak-ai-lock-')), 'interim', 'acquire.lock');

describe('withLock', () => {
  it('runs the work and releases the lock, also when the work throws', async () => {
    const file = lockFile();
    expect(await withLock(file, () => Promise.resolve(42))).toBe(42);
    expect(existsSync(file)).toBe(false);
    await expect(withLock(file, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(existsSync(file)).toBe(false);
  });

  it('refuses a second run while the first holds the lock', async () => {
    const file = lockFile();
    await withLock(file, async () => {
      await expect(withLock(file, () => Promise.resolve(1))).rejects.toThrow(/Another acquire run/);
    });
  });

  it('replaces a stale or unreadable lock left by a crashed run', async () => {
    const file = lockFile();
    await withLock(file, () => Promise.resolve(0)); // creates the folder
    const old = new Date(Date.now() - LOCK_STALE_MS - 1_000).toISOString();
    writeFileSync(file, JSON.stringify({ pid: 1, started_at: old }));
    expect(await withLock(file, () => Promise.resolve('ok'))).toBe('ok');
    writeFileSync(file, '{not json');
    expect(await withLock(file, () => Promise.resolve('ok'))).toBe('ok');
  });
});
