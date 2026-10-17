import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentPointer,
  indexOf,
  openVersionFile,
  resetPointerCache,
  type Pointer,
} from './publishedData.js';

/** One object in the fake publish bucket; `error` makes reads of it fail. */
interface StoredObject {
  readonly body: string;
  readonly contentType?: string;
  readonly size?: string;
  readonly error?: Error;
}

interface FakeFile {
  exists: () => Promise<[boolean]>;
  download: () => Promise<[Buffer]>;
  getMetadata: () => Promise<[{ contentType?: string; size?: string }]>;
  createReadStream: () => Readable;
}

const file = vi.hoisted(() => vi.fn<(path: string) => FakeFile>());
const bucketName = vi.hoisted(() => vi.fn<(name: string) => void>());
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: (name: string) => {
      bucketName(name);
      return { file };
    },
  }),
}));

const objects = new Map<string, StoredObject>();

function fakeFile(object: StoredObject | undefined): FakeFile {
  const read = <T>(value: T): Promise<T> => {
    if (object === undefined) return Promise.reject(new Error('No such object'));
    return object.error === undefined ? Promise.resolve(value) : Promise.reject(object.error);
  };
  const metadata = {
    ...(object?.contentType === undefined ? {} : { contentType: object.contentType }),
    ...(object?.size === undefined ? {} : { size: object.size }),
  };
  return {
    exists: () => Promise.resolve([object !== undefined]),
    download: () => read<[Buffer]>([Buffer.from(object?.body ?? '', 'utf8')]),
    getMetadata: () => read<[typeof metadata]>([metadata]),
    createReadStream: () => Readable.from([object?.body ?? '']),
  };
}

const VERSION = '2026-10-17T03-05-00-000Z';
const POINTER: Pointer = {
  version: VERSION,
  built_at: '2026-10-17T03:05:00.000Z',
  published_at: '2026-10-17T03:20:00.000Z',
  files: [{ file: 'graph-lab.json.gz', label: 'Public records', synthetic: false }],
  rows: { nodes: 10, edges: 20 },
};
/** What the ingestion actually writes: the pointer plus fields this function does not use. */
const STORED_POINTER = { ...POINTER, run_id: 'run-1', seed_cases: [], bundle_bytes: 5, gates: [] };

function publish(path: string, object: StoredObject): void {
  objects.set(path, object);
}

beforeEach(() => {
  objects.clear();
  file.mockReset();
  file.mockImplementation((path) => fakeFile(objects.get(path)));
  bucketName.mockReset();
  resetPointerCache();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
  vi.stubEnv('PUBLIC_DATA_BUCKET', undefined);
  vi.stubEnv('PUBLIC_DATA_CHANNEL', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetPointerCache();
});

describe('currentPointer', () => {
  it('reads <channel>/current.json from the default publish bucket and keeps only known fields', async () => {
    publish('live/current.json', { body: JSON.stringify(STORED_POINTER) });
    await expect(currentPointer()).resolves.toEqual(POINTER);
    expect(bucketName).toHaveBeenCalledWith('fund-tracer-ingest-publish');
    expect(file).toHaveBeenCalledWith('live/current.json');
  });

  it('reads the dry-run channel from an explicit bucket when configured', async () => {
    vi.stubEnv('PUBLIC_DATA_BUCKET', 'other-bucket');
    vi.stubEnv('PUBLIC_DATA_CHANNEL', 'dry-run');
    publish('dry-run/current.json', { body: JSON.stringify(POINTER) });
    publish('live/current.json', { body: '{"broken"' });
    await expect(currentPointer()).resolves.toEqual(POINTER);
    expect(bucketName).toHaveBeenCalledWith('other-bucket');
    expect(file).toHaveBeenCalledWith('dry-run/current.json');
    expect(file).not.toHaveBeenCalledWith('live/current.json');
  });

  it('returns null when nothing is published, without downloading', async () => {
    await expect(currentPointer()).resolves.toBeNull();
    await expect(currentPointer()).resolves.toBeNull();
    // A missing pointer is not cached: publishing later is seen straight away.
    expect(file).toHaveBeenCalledTimes(2);
  });

  it('rejects a pointer that is not JSON', async () => {
    publish('live/current.json', { body: '{"version": ' });
    await expect(currentPointer()).rejects.toThrow(SyntaxError);
  });

  it.each([
    ['a version folder that could escape', { ...POINTER, version: '../dry-run' }],
    ['an empty file list', { ...POINTER, files: [] }],
    ['a negative row count', { ...POINTER, rows: { nodes: -1 } }],
    ['a fractional row count', { ...POINTER, rows: { nodes: 1.5 } }],
    ['a build time that is not a timestamp', { ...POINTER, built_at: 'yesterday' }],
    ['a missing publish time', { ...POINTER, published_at: undefined }],
    [
      'a file entry without a name',
      { ...POINTER, files: [{ file: '', label: 'x', synthetic: false }] },
    ],
    ['an array', [POINTER]],
  ])('rejects a pointer with %s (parse, do not cast)', async (_label, pointer) => {
    publish('live/current.json', { body: JSON.stringify(pointer) });
    await expect(currentPointer()).rejects.toThrow();
  });

  it('does not cache a rejected pointer', async () => {
    publish('live/current.json', { body: '[]' });
    await expect(currentPointer()).rejects.toThrow();
    publish('live/current.json', { body: JSON.stringify(POINTER) });
    await expect(currentPointer()).resolves.toEqual(POINTER);
  });

  it('passes on a Storage failure', async () => {
    publish('live/current.json', { body: '', error: new Error('socket hang up') });
    await expect(currentPointer()).rejects.toThrow('socket hang up');
  });
});

describe('pointer cache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T04:00:00.000Z'));
    publish('live/current.json', { body: JSON.stringify(POINTER) });
  });

  it('serves repeat requests from memory for up to a minute', async () => {
    await currentPointer();
    vi.setSystemTime(new Date('2026-10-17T04:00:59.999Z'));
    publish('live/current.json', {
      body: JSON.stringify({ ...POINTER, version: '2026-10-18T03-05-00-000Z' }),
    });
    await expect(currentPointer()).resolves.toEqual(POINTER);
    expect(file).toHaveBeenCalledTimes(1);
  });

  it('reads the pointer again once a minute has passed', async () => {
    await currentPointer();
    const next = { ...POINTER, version: '2026-10-18T03-05-00-000Z' };
    publish('live/current.json', { body: JSON.stringify(next) });
    vi.setSystemTime(new Date('2026-10-17T04:01:00.000Z'));
    await expect(currentPointer()).resolves.toEqual(next);
    expect(file).toHaveBeenCalledTimes(2);
  });

  it('resetPointerCache() forces a fresh read', async () => {
    await currentPointer();
    resetPointerCache();
    await currentPointer();
    expect(file).toHaveBeenCalledTimes(2);
  });
});

describe('indexOf', () => {
  it('places every bundle file under its immutable version folder', () => {
    const pointer: Pointer = {
      ...POINTER,
      files: [
        { file: 'graph-lab.json.gz', label: 'Public records', synthetic: false },
        { file: 'synthetic/demo.json', label: 'SYNTH demo', synthetic: true },
      ],
    };
    expect(indexOf(pointer)).toEqual([
      { file: `versions/${VERSION}/graph-lab.json.gz`, label: 'Public records', synthetic: false },
      { file: `versions/${VERSION}/synthetic/demo.json`, label: 'SYNTH demo', synthetic: true },
    ]);
  });
});

describe('openVersionFile', () => {
  it('opens a published bundle file with its type and size', async () => {
    publish(`live/versions/${VERSION}/graph-lab.json.gz`, {
      body: 'bundle-bytes',
      contentType: 'application/gzip',
      size: '12',
    });
    const opened = await openVersionFile(VERSION, 'graph-lab.json.gz');
    expect(opened?.contentType).toBe('application/gzip');
    expect(opened?.size).toBe(12);
    expect(opened === null ? null : await text(opened.stream)).toBe('bundle-bytes');
  });

  it('falls back to a generic type and zero size when the metadata lacks them', async () => {
    publish(`live/versions/${VERSION}/a.json`, { body: '{}' });
    const opened = await openVersionFile(VERSION, 'a.json');
    expect(opened?.contentType).toBe('application/octet-stream');
    expect(opened?.size).toBe(0);
  });

  it('reads from the configured channel only', async () => {
    vi.stubEnv('PUBLIC_DATA_CHANNEL', 'dry-run');
    publish(`live/versions/${VERSION}/a.json`, { body: '{}' });
    await expect(openVersionFile(VERSION, 'a.json')).resolves.toBeNull();
    expect(file).toHaveBeenCalledWith(`dry-run/versions/${VERSION}/a.json`);
  });

  it('returns null for a file that does not exist', async () => {
    await expect(openVersionFile(VERSION, 'missing.json')).resolves.toBeNull();
  });

  it.each([
    '..',
    '../live',
    '%2e%2e',
    '2026-10',
    `${VERSION}/x`,
    `${VERSION}.json`,
    '2026-10-17T03:05:00.000Z',
    '1'.repeat(41),
  ])('rejects the unsafe version %j without touching Storage', async (version) => {
    await expect(openVersionFile(version, 'a.json')).resolves.toBeNull();
    expect(file).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '..',
    '../current.json',
    '../../dry-run/current.json',
    'a/../../current.json',
    'a..b.json',
    '/etc/passwd',
    '.env',
    '%2e%2e/current.json',
    '..%2fcurrent.json',
    '..\\current.json',
    'a b.json',
    'https://evil.example/x.json',
    'a'.repeat(202),
  ])('rejects the unsafe file path %j without touching Storage', async (path) => {
    await expect(openVersionFile(VERSION, path)).resolves.toBeNull();
    expect(file).not.toHaveBeenCalled();
  });

  it('accepts nested plain paths up to the length limit', async () => {
    publish(`live/versions/${VERSION}/nested/dir/file_1-a.json`, { body: '{}' });
    await expect(openVersionFile(VERSION, 'nested/dir/file_1-a.json')).resolves.not.toBeNull();
    const longest = 'a'.repeat(201);
    publish(`live/versions/${VERSION}/${longest}`, { body: '{}' });
    await expect(openVersionFile(VERSION, longest)).resolves.not.toBeNull();
  });

  it('passes on a Storage failure while reading metadata', async () => {
    publish(`live/versions/${VERSION}/a.json`, { body: '', error: new Error('timeout') });
    await expect(openVersionFile(VERSION, 'a.json')).rejects.toThrow('timeout');
  });
});
