import type { Response } from 'express';
import type { Request } from 'firebase-functions/v2/https';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileStore, UserProfile } from '../services/profiles.js';
import { resetPointerCache } from '../services/publishedData.js';
import { publicDataHandler } from './publicData.js';

const verifyIdToken = vi.hoisted(() => vi.fn<(token: string) => Promise<unknown>>());
const verifyToken = vi.hoisted(() => vi.fn<(token: string) => Promise<unknown>>());
const logError = vi.hoisted(() => vi.fn());
const file = vi.hoisted(() => vi.fn<(path: string) => FakeFile>());

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken }) }));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ file }) }) }));
vi.mock('firebase-functions', () => ({
  logger: { error: logError, info: vi.fn(), warn: vi.fn() },
}));

/** One object in the fake publish bucket; `error` makes reads fail, `stream` overrides the body. */
interface StoredObject {
  readonly body: string;
  readonly contentType?: string;
  readonly error?: Error;
  readonly stream?: () => Readable;
}

interface FakeFile {
  exists: () => Promise<[boolean]>;
  download: () => Promise<[Buffer]>;
  getMetadata: () => Promise<[{ contentType?: string; size: string }]>;
  createReadStream: () => Readable;
}

const objects = new Map<string, StoredObject>();

function fakeFile(object: StoredObject | undefined): FakeFile {
  const read = <T>(value: T): Promise<T> =>
    object?.error === undefined ? Promise.resolve(value) : Promise.reject(object.error);
  const body = object?.body ?? '';
  const meta = {
    ...(object?.contentType === undefined ? {} : { contentType: object.contentType }),
    size: String(Buffer.byteLength(body)),
  };
  return {
    exists: () => Promise.resolve([object !== undefined]),
    download: () => read<[Buffer]>([Buffer.from(body, 'utf8')]),
    getMetadata: () => read<[typeof meta]>([meta]),
    createReadStream: () => object?.stream?.() ?? Readable.from([Buffer.from(body, 'utf8')]),
  };
}

/** The parts of an Express response the handler uses, collecting what it writes. */
class FakeResponse extends Writable {
  statusCode = 0;
  readonly headers: Record<string, string> = {};
  body: unknown = undefined;
  readonly chunks: Buffer[] = [];

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    this.end();
    return this;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.chunks.push(chunk);
    done();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

/** Resolves once the response has finished or been destroyed. */
function settled(res: FakeResponse): Promise<void> {
  if (res.closed) return Promise.resolve();
  return new Promise((resolve) => {
    res.once('close', () => {
      resolve();
    });
  });
}

const ID_TOKEN = 'valid-id-token';
const APP_CHECK = 'valid-app-check';
const AUTHED = { Authorization: `Bearer ${ID_TOKEN}`, 'X-Firebase-AppCheck': APP_CHECK };

const PROFILE: UserProfile = {
  name: 'Asha',
  employeeId: '',
  branchId: 'br-shirur',
  role: 'branch_manager',
  aiEnabled: false,
  enabled: true,
};
/** Everyone has an enabled profile unless a test passes its own store. */
const SET_UP: ProfileStore = { get: () => Promise.resolve(PROFILE) };

async function call(
  path: string,
  options: { method?: string; headers?: Record<string, string>; profiles?: ProfileStore } = {},
): Promise<FakeResponse> {
  const headers = new Map(
    Object.entries(options.headers ?? AUTHED).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const req = {
    method: options.method ?? 'GET',
    path,
    get: (name: string) => headers.get(name.toLowerCase()),
  };
  const res = new FakeResponse();
  await publicDataHandler(
    req as unknown as Request,
    res as unknown as Response,
    options.profiles ?? SET_UP,
  );
  return res;
}

const VERSION = '2026-10-17T03-05-00-000Z';
const BASE = '/data/public-records/';
const POINTER = {
  version: VERSION,
  built_at: '2026-10-17T03:05:00.000Z',
  published_at: '2026-10-17T03:20:00.000Z',
  files: [{ file: 'graph-lab.json.gz', label: 'Public records', synthetic: false }],
  rows: { nodes: 10, edges: 20 },
  // Written by the ingestion but not part of what the app is served.
  run_id: 'run-1',
  seed_cases: ['maheep'],
  bundle_bytes: 12,
  gates: [],
};

function publishPointer(body: string = JSON.stringify(POINTER)): void {
  objects.set('live/current.json', { body });
}

beforeEach(() => {
  objects.clear();
  file.mockReset();
  file.mockImplementation((path) => fakeFile(objects.get(path)));
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation((token) =>
    token === ID_TOKEN ? Promise.resolve({ uid: 'u1' }) : Promise.reject(new Error('expired')),
  );
  verifyToken.mockReset();
  verifyToken.mockImplementation((token) =>
    token === APP_CHECK ? Promise.resolve({ appId: 'app' }) : Promise.reject(new Error('bad')),
  );
  logError.mockReset();
  resetPointerCache();
  vi.stubEnv('GCLOUD_PROJECT', 'fund-tracer');
  vi.stubEnv('FUNCTIONS_EMULATOR', '');
  vi.stubEnv('PUBLIC_DATA_BUCKET', undefined);
  vi.stubEnv('PUBLIC_DATA_CHANNEL', undefined);
  publishPointer();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetPointerCache();
});

describe('publicDataHandler: method', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'answers %s with 405 before checking anyone',
    async (method) => {
      const res = await call(`${BASE}index.json`, { method });
      expect(res.statusCode).toBe(405);
      expect(res.body).toEqual({ error: 'Method not allowed' });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(verifyIdToken).not.toHaveBeenCalled();
      expect(file).not.toHaveBeenCalled();
    },
  );
});

describe('publicDataHandler: sign-in', () => {
  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { Authorization: `Basic ${ID_TOKEN}` }],
    ['an empty Bearer token', { Authorization: 'Bearer ' }],
  ])('answers 401 for %s without verifying anything', async (_label, headers) => {
    const res = await call(`${BASE}index.json`, { headers });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in required' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it('answers 401 for an invalid or expired ID token, before App Check or Storage', async () => {
    const res = await call(`${BASE}index.json`, {
      headers: { ...AUTHED, Authorization: 'Bearer expired-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in required' });
    expect(verifyIdToken.mock.calls[0]?.[0]).toBe('expired-token');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it('still requires sign-in in the emulator', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    const res = await call(`${BASE}index.json`, { headers: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('publicDataHandler: App Check', () => {
  it('answers 401 "App verification failed" without an App Check token', async () => {
    const res = await call(`${BASE}index.json`, {
      headers: { Authorization: `Bearer ${ID_TOKEN}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'App verification failed' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
  });

  it('answers 401 "App verification failed" for an invalid App Check token', async () => {
    const res = await call(`${BASE}index.json`, {
      headers: { ...AUTHED, 'X-Firebase-AppCheck': 'forged' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'App verification failed' });
    expect(verifyToken.mock.calls[0]?.[0]).toBe('forged');
    expect(file).not.toHaveBeenCalled();
  });

  it('is not required in the emulator, which cannot verify it', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    const res = await call(`${BASE}index.json`, {
      headers: { Authorization: `Bearer ${ID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('fails loudly on a misconfigured channel (the Functions runtime answers 500)', async () => {
    vi.stubEnv('PUBLIC_DATA_CHANNEL', 'prod');
    await expect(call(`${BASE}index.json`)).rejects.toThrow(/PUBLIC_DATA_CHANNEL/);
  });
});

describe('publicDataHandler: profile (B-38)', () => {
  it('answers 403 for a signed-in person the owner has not set up, before reading Storage', async () => {
    const get = vi.fn<ProfileStore['get']>(() => Promise.resolve(null));
    const res = await call(`${BASE}index.json`, { profiles: { get } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Account not set up' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(get).toHaveBeenCalledWith('u1', null);
    expect(file).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the profile cannot be read', async () => {
    const res = await call(`${BASE}index.json`, {
      profiles: { get: () => Promise.reject(new Error('firestore down')) },
    });
    expect(res.statusCode).toBe(503);
    expect(file).not.toHaveBeenCalled();
  });

  it('checks the profile only after sign-in and App Check pass', async () => {
    const get = vi.fn<ProfileStore['get']>(() => Promise.resolve(PROFILE));
    await call(`${BASE}index.json`, { headers: {}, profiles: { get } });
    await call(`${BASE}index.json`, {
      headers: { Authorization: `Bearer ${ID_TOKEN}` },
      profiles: { get },
    });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('publicDataHandler: index and current', () => {
  it('serves the index with every file under its version folder', async () => {
    const res = await call(`${BASE}index.json`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      { file: `versions/${VERSION}/graph-lab.json.gz`, label: 'Public records', synthetic: false },
    ]);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(verifyIdToken.mock.calls[0]?.[0]).toBe(ID_TOKEN);
    expect(verifyToken.mock.calls[0]?.[0]).toBe(APP_CHECK);
  });

  it('serves only the public summary of the current pointer', async () => {
    const res = await call(`${BASE}current.json`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      version: VERSION,
      built_at: POINTER.built_at,
      published_at: POINTER.published_at,
      rows: POINTER.rows,
    });
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('answers HEAD for the index with the same status and headers', async () => {
    const res = await call(`${BASE}index.json`, { method: 'HEAD' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('answers 404 when nothing is published yet', async () => {
    objects.clear();
    const res = await call(`${BASE}index.json`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Nothing published yet' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each([BASE, `${BASE}other.json`, '/index.json', '/data/index.json', `${BASE}versions/`])(
    'answers 404 for the unknown path %j',
    async (path) => {
      const res = await call(path);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    },
  );
});

describe('publicDataHandler: bundle files', () => {
  const BUNDLE = `${BASE}versions/${VERSION}/graph-lab.json.gz`;

  beforeEach(() => {
    objects.set(`live/versions/${VERSION}/graph-lab.json.gz`, {
      body: 'gzip-bytes',
      contentType: 'application/gzip',
    });
  });

  it('streams a bundle file with immutable caching', async () => {
    const res = await call(BUNDLE);
    await settled(res);
    expect(res.statusCode).toBe(200);
    expect(res.text()).toBe('gzip-bytes');
    expect(res.headers).toMatchObject({
      'content-type': 'application/gzip',
      'content-length': '10',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
  });

  it('answers HEAD with the headers and no body', async () => {
    const res = await call(BUNDLE, { method: 'HEAD' });
    await settled(res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-length']).toBe('10');
    expect(res.headers['content-type']).toBe('application/gzip');
    expect(res.writableEnded).toBe(true);
    expect(res.chunks).toHaveLength(0);
  });

  it('answers 404 for a file that is not in the bucket', async () => {
    const res = await call(`${BASE}versions/${VERSION}/missing.json`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('ends the response and logs only the reason when the stream fails midway', async () => {
    objects.set(`live/versions/${VERSION}/broken.json`, {
      body: 'x',
      stream: () =>
        new Readable({
          read(): void {
            this.destroy(new Error('connection reset'));
          },
        }),
    });
    const res = await call(`${BASE}versions/${VERSION}/broken.json`);
    await settled(res);
    expect(res.destroyed).toBe(true);
    expect(logError).toHaveBeenCalledWith('publicData: stream failed', {
      reason: 'connection reset',
    });
  });

  it.each([
    `${BASE}versions/${VERSION}/../current.json`,
    `${BASE}versions/${VERSION}/../../dry-run/current.json`,
    `${BASE}versions/../current.json`,
    `${BASE}versions/../../x/y.json`,
    `${BASE}versions/%2e%2e/current.json`,
    `${BASE}versions/${VERSION}/%2e%2e/current.json`,
    `${BASE}versions/${VERSION}/..%2f..%2fcurrent.json`,
    `${BASE}versions/${VERSION}/%2e%2e%2fcurrent.json`,
    `${BASE}versions/${VERSION}/a/../../../current.json`,
    `${BASE}versions/${VERSION}/..\\current.json`,
    `${BASE}versions/${VERSION}//etc/passwd`,
    `${BASE}versions/${VERSION}/.env`,
    `${BASE}versions/not-a-version/graph-lab.json.gz`,
  ])('rejects the traversal or unsafe path %j without reading it', async (path) => {
    const res = await call(path);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    // Only the pointer is read; no object outside the version folders is ever opened.
    expect(file.mock.calls.map(([p]) => p)).toEqual(['live/current.json']);
  });
});

describe('publicDataHandler: Storage failures', () => {
  it('answers 503 with a retry message when the pointer cannot be read', async () => {
    objects.set('live/current.json', { body: '', error: new Error('socket hang up') });
    const res = await call(`${BASE}index.json`);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Data temporarily unavailable. Try again.' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(logError).toHaveBeenCalledWith('publicData: read failed', { reason: 'socket hang up' });
  });

  it.each([
    ['not JSON', '{"version": '],
    ['schema-invalid', JSON.stringify({ ...POINTER, version: '../x' })],
  ])('answers 503 when the pointer is %s', async (_label, body) => {
    publishPointer(body);
    const res = await call(`${BASE}current.json`);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Data temporarily unavailable. Try again.' });
  });

  it('answers 503 when a bundle file cannot be opened', async () => {
    objects.set(`live/versions/${VERSION}/a.json`, { body: '', error: new Error('timeout') });
    const res = await call(`${BASE}versions/${VERSION}/a.json`);
    expect(res.statusCode).toBe(503);
  });

  it('recovers on the next request once the pointer is readable again', async () => {
    publishPointer('[]');
    expect((await call(`${BASE}index.json`)).statusCode).toBe(503);
    publishPointer();
    expect((await call(`${BASE}index.json`)).statusCode).toBe(200);
  });

  it('never logs the caller’s tokens', async () => {
    objects.set('live/current.json', { body: '', error: new Error('socket hang up') });
    await call(`${BASE}index.json`);
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).not.toContain(ID_TOKEN);
    expect(logged).not.toContain(APP_CHECK);
  });
});
