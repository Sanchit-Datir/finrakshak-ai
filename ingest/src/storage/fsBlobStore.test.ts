import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABSENT, ifGeneration, PreconditionFailedError } from './blobStore.js';
import { FsBlobStore } from './fsBlobStore.js';

const store = (): { s: FsBlobStore; root: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'fsblob-'));
  return { s: new FsBlobStore(root), root };
};

describe('FsBlobStore', () => {
  it('returns null for a missing key and round-trips a write', async () => {
    const { s } = store();
    expect(await s.read('a/b.json')).toBeNull();
    expect(await s.stat('a/b.json')).toBeNull();
    const gen = await s.write('a/b.json', '{"x":1}');
    const read = await s.read('a/b.json');
    expect(read?.data.toString()).toBe('{"x":1}');
    expect(read?.generation).toBe(gen);
  });

  it('create-only (ABSENT) refuses an existing key', async () => {
    const { s } = store();
    await s.write('raw/ed/files/aa/x.pdf', 'v1', { condition: ABSENT });
    await expect(
      s.write('raw/ed/files/aa/x.pdf', 'v2', { condition: ABSENT }),
    ).rejects.toBeInstanceOf(PreconditionFailedError);
    expect((await s.read('raw/ed/files/aa/x.pdf'))?.data.toString()).toBe('v1');
  });

  it('compare-and-swap refuses a stale generation', async () => {
    const { s } = store();
    const g1 = await s.write('k.txt', 'one');
    const g2 = await s.write('k.txt', 'two-longer', { condition: ifGeneration(g1) });
    await expect(s.write('k.txt', 'three', { condition: ifGeneration(g1) })).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
    await s.write('k.txt', 'three', { condition: ifGeneration(g2) });
    expect((await s.read('k.txt'))?.data.toString()).toBe('three');
  });

  it('lists recursively in key order, skipping temp files, and deletes idempotently', async () => {
    const { s, root } = store();
    await s.write('p/b.json', 'b');
    await s.write('p/a/c.json', 'c');
    await s.write('q/z.json', 'z');
    writeFileSync(path.join(root, 'p', 'x.json.tmp-1-2'), 'partial');
    expect((await s.list('p')).map((b) => b.key)).toEqual(['p/a/c.json', 'p/b.json']);
    expect(await s.list('missing')).toEqual([]);
    await s.delete('p/b.json');
    await s.delete('p/b.json');
    expect((await s.list('p/')).map((b) => b.key)).toEqual(['p/a/c.json']);
    expect(s.uri()).toBeNull();
  });
});
