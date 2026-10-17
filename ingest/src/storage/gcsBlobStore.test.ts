import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABSENT, ifGeneration, PreconditionFailedError } from './blobStore.js';

interface Call {
  bucket: string;
  name: string;
  op: string;
  args: unknown;
}
const calls = vi.hoisted(() => [] as Call[]);
const behaviour = vi.hoisted(() => ({
  saveError: null as Error | null,
  metaError: null as Error | null,
  files: [] as unknown[],
}));

vi.mock('@google-cloud/storage', () => {
  class FakeFile {
    metadata: Record<string, unknown> = {};
    constructor(
      private readonly bucket: string,
      readonly name: string,
      private readonly opts: unknown,
    ) {}
    save(_data: Buffer, options: unknown): Promise<void> {
      calls.push({ bucket: this.bucket, name: this.name, op: 'save', args: options });
      if (behaviour.saveError) return Promise.reject(behaviour.saveError);
      this.metadata = { generation: '42' };
      return Promise.resolve();
    }
    getMetadata(): Promise<[Record<string, unknown>]> {
      calls.push({ bucket: this.bucket, name: this.name, op: 'meta', args: this.opts });
      if (behaviour.metaError) return Promise.reject(behaviour.metaError);
      return Promise.resolve([{ generation: '7', size: '3', updated: '2026-10-17T00:00:00Z' }]);
    }
    download(): Promise<[Buffer]> {
      calls.push({ bucket: this.bucket, name: this.name, op: 'download', args: this.opts });
      return Promise.resolve([Buffer.from('abc')]);
    }
    delete(): Promise<void> {
      calls.push({ bucket: this.bucket, name: this.name, op: 'delete', args: null });
      return Promise.resolve();
    }
  }
  class Storage {
    bucket(name: string): unknown {
      return {
        file: (n: string, opts?: unknown) => new FakeFile(name, n, opts),
        getFiles: (q: unknown) => {
          calls.push({ bucket: name, name: '', op: 'list', args: q });
          return Promise.resolve([behaviour.files]);
        },
      };
    }
  }
  return { Storage };
});

const { GcsBlobStore, locate } = await import('./gcsBlobStore.js');
const LAYOUT = { raw: 'b-raw', state: 'b-state', publish: 'b-pub' };
const httpError = (code: number): Error => Object.assign(new Error(`http ${code}`), { code });

beforeEach(() => {
  calls.length = 0;
  behaviour.saveError = null;
  behaviour.metaError = null;
  behaviour.files = [];
});

describe('locate (bucket routing)', () => {
  it('sends raw files, publish keys and everything else to their buckets', () => {
    expect(locate(LAYOUT, 'raw/ed/files/ab/x.pdf')).toEqual({
      bucket: 'b-raw',
      name: 'raw/ed/files/ab/x.pdf',
    });
    expect(locate(LAYOUT, 'raw/ed/manifest.jsonl')).toEqual({
      bucket: 'b-state',
      name: 'raw/ed/manifest.jsonl',
    });
    expect(locate(LAYOUT, 'publish/live/current.json')).toEqual({
      bucket: 'b-pub',
      name: 'live/current.json',
    });
    expect(locate(LAYOUT, 'interim/state/ed.json')).toEqual({
      bucket: 'b-state',
      name: 'interim/state/ed.json',
    });
  });
});

describe('GcsBlobStore', () => {
  it('maps create-only and compare-and-swap to ifGenerationMatch', async () => {
    const s = new GcsBlobStore(LAYOUT);
    expect(await s.write('raw/ed/files/ab/x.pdf', 'x', { condition: ABSENT })).toBe('42');
    await s.write('interim/listings/ed.jsonl', 'y', { condition: ifGeneration('17') });
    await s.write('interim/listings/ed.jsonl', 'z');
    const saves = calls
      .filter((c) => c.op === 'save')
      .map((c) => c.args as { preconditionOpts?: unknown });
    expect(saves[0]?.preconditionOpts).toEqual({ ifGenerationMatch: 0 });
    expect(saves[1]?.preconditionOpts).toEqual({ ifGenerationMatch: 17 });
    expect(saves[2]?.preconditionOpts).toBeUndefined();
  });

  it('turns HTTP 412 into PreconditionFailedError and other failures into errors with a cause', async () => {
    const s = new GcsBlobStore(LAYOUT);
    behaviour.saveError = httpError(412);
    await expect(s.write('k', 'v', { condition: ABSENT })).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
    behaviour.saveError = httpError(500);
    await expect(s.write('k', 'v')).rejects.toThrow(/Could not write k/);
  });

  it('reads the exact generation it stat-ed, and returns null for 404', async () => {
    const s = new GcsBlobStore(LAYOUT);
    const read = await s.read('interim/state/ed.json');
    expect(read).toEqual({ data: Buffer.from('abc'), generation: '7' });
    expect(calls.find((c) => c.op === 'download')?.args).toEqual({ generation: 7 });
    behaviour.metaError = httpError(404);
    expect(await s.read('missing')).toBeNull();
    expect(await s.stat('missing')).toBeNull();
  });

  it('lists with the publish prefix restored on keys, and gives gs:// URIs', async () => {
    const s = new GcsBlobStore(LAYOUT);
    behaviour.files = [
      {
        name: 'live/versions/v1/a.json',
        metadata: { generation: '1', size: '2', updated: '2026-10-17T00:00:00Z' },
      },
    ];
    expect((await s.list('publish/live')).map((b) => b.key)).toEqual([
      'publish/live/versions/v1/a.json',
    ]);
    expect(calls.find((c) => c.op === 'list')?.args).toMatchObject({ prefix: 'live/' });
    expect(s.uri('processed/entities.jsonl')).toBe('gs://b-state/processed/entities.jsonl');
  });
});
