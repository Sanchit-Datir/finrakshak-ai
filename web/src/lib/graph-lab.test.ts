import type { GraphLabBundle, GraphLabIndexEntry } from '@fund-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchIndex,
  GRAPH_LAB_BASE,
  GraphLabLoadError,
  loadBundleFromUrl,
  PUBLIC_DATA_BASE,
  setDataHeadersProvider,
  type DataHeadersProvider,
} from './graph-lab.js';

const CLOUD_INDEX = `${PUBLIC_DATA_BASE}index.json`;
const LOCAL_INDEX = `${GRAPH_LAB_BASE}index.json`;
const VERSION = '2026-10-17T03-05-00-000Z';
const CREDENTIALS = { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' };

// SYNTHETIC: an empty bundle, enough to exercise loading.
const BUNDLE: GraphLabBundle = {
  meta: {
    generated_at: '2026-10-16T00:00:00Z',
    synthetic: true,
    label: 'SYNTHETIC',
    dataset_built_at: null,
    thresholds: {},
    counts: {},
    notes: [],
  },
  nodes: [],
  edges: [],
  documents: [],
  networks: [],
  identity: [],
};

const entry = (file: string, synthetic = false): GraphLabIndexEntry => ({
  file,
  label: 'Public records',
  synthetic,
});

type Route = () => Response | Promise<Response>;
const json = (body: unknown, status = 200): Route => {
  return () => new Response(JSON.stringify(body), { status });
};
const status = (code: number): Route => {
  return () => new Response('refused', { status: code });
};

const fetchMock = vi.fn<typeof fetch>();
let routes: Record<string, Route> = {};

function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

/** Every request made: its URL and the headers sent with it. */
function requests(): { url: string; headers: HeadersInit | undefined }[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: urlOf(input),
    headers: init?.headers,
  }));
}

beforeEach(() => {
  routes = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const route = routes[urlOf(input)];
    return route === undefined ? new Response('not found', { status: 404 }) : route();
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  setDataHeadersProvider(null);
  vi.unstubAllGlobals();
});

describe('fetchIndex: sources', () => {
  it('reads the cloud-published index first and returns same-origin paths', async () => {
    routes[CLOUD_INDEX] = json([entry(`versions/${VERSION}/graph-lab.json.gz`)]);
    routes[LOCAL_INDEX] = json([entry('local.json.gz')]);
    await expect(fetchIndex()).resolves.toEqual([
      entry(`${PUBLIC_DATA_BASE}versions/${VERSION}/graph-lab.json.gz`),
    ]);
    expect(requests().map((r) => r.url)).toEqual([CLOUD_INDEX]);
  });

  it.each([
    ['signed out (401)', status(401)],
    ['nothing published (404)', status(404)],
    ['temporarily unavailable (503)', status(503)],
    ['an HTML page instead of JSON', () => new Response('<!doctype html>', { status: 200 })],
    ['JSON that is not an index', json({ files: [] })],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('falls back to /graph-lab/ when the cloud path gives %s', async (_label, cloud) => {
    routes[CLOUD_INDEX] = cloud;
    routes[LOCAL_INDEX] = json([entry('graph-lab.json.gz'), entry('synthetic/demo.json', true)]);
    await expect(fetchIndex()).resolves.toEqual([
      entry(`${GRAPH_LAB_BASE}graph-lab.json.gz`),
      entry(`${GRAPH_LAB_BASE}synthetic/demo.json`, true),
    ]);
    expect(requests().map((r) => r.url)).toEqual([CLOUD_INDEX, LOCAL_INDEX]);
  });

  it('fails with a load error, keeping the last cause, when neither source answers', async () => {
    const error = await fetchIndex().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphLabLoadError);
    expect(error instanceof Error ? error.message : '').toBe('No graph bundle is available.');
    const cause = error instanceof Error ? error.cause : null;
    expect(cause instanceof Error ? cause.message : '').toContain(LOCAL_INDEX);
  });

  it('bounds every request with a timeout signal', async () => {
    routes[LOCAL_INDEX] = json([entry('graph-lab.json.gz')]);
    await fetchIndex();
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('data headers (Firebase ID token + App Check)', () => {
  it('sends them to the cloud data path only, never to the fallback', async () => {
    const provider = vi.fn<DataHeadersProvider>(() => Promise.resolve(CREDENTIALS));
    setDataHeadersProvider(provider);
    routes[CLOUD_INDEX] = status(401);
    routes[LOCAL_INDEX] = json([entry('graph-lab.json.gz')]);
    await fetchIndex();
    expect(requests()).toEqual([
      { url: CLOUD_INDEX, headers: CREDENTIALS },
      { url: LOCAL_INDEX, headers: {} },
    ]);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('are sent with a cloud bundle download', async () => {
    setDataHeadersProvider(() => Promise.resolve(CREDENTIALS));
    const file = `${PUBLIC_DATA_BASE}versions/${VERSION}/graph-lab.json`;
    routes[file] = json(BUNDLE);
    await expect(loadBundleFromUrl(file)).resolves.toEqual(BUNDLE);
    expect(requests()).toEqual([{ url: file, headers: CREDENTIALS }]);
  });

  it.each([`${GRAPH_LAB_BASE}graph-lab.json`, 'graph-lab.json'])(
    'are not sent with the local bundle %j',
    async (file) => {
      const provider = vi.fn<DataHeadersProvider>(() => Promise.resolve(CREDENTIALS));
      setDataHeadersProvider(provider);
      routes[`${GRAPH_LAB_BASE}graph-lab.json`] = json(BUNDLE);
      await loadBundleFromUrl(file);
      expect(requests()).toEqual([{ url: `${GRAPH_LAB_BASE}graph-lab.json`, headers: {} }]);
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://evil.example/data/public-records/index.json',
    '//evil.example/data/public-records/x.json',
    `/x${PUBLIC_DATA_BASE}graph-lab.json`,
    '../graph-lab.json',
    'a/../../graph-lab.json',
    // Regression: an indexed prefix used to skip the check (B-44).
    `${PUBLIC_DATA_BASE}../x.json`,
    `${PUBLIC_DATA_BASE}versions/v1/../../current.json`,
    `${GRAPH_LAB_BASE}../index.html`,
    PUBLIC_DATA_BASE,
  ])('refuses the bundle path %j without any request', async (file) => {
    const provider = vi.fn<DataHeadersProvider>(() => Promise.resolve(CREDENTIALS));
    setDataHeadersProvider(provider);
    await expect(loadBundleFromUrl(file)).rejects.toThrow('Invalid bundle path.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('setDataHeadersProvider(null) goes back to sending no headers', async () => {
    const provider = vi.fn<DataHeadersProvider>(() => Promise.resolve(CREDENTIALS));
    setDataHeadersProvider(provider);
    setDataHeadersProvider(null);
    routes[CLOUD_INDEX] = json([entry('a.json')]);
    await fetchIndex();
    expect(requests()).toEqual([{ url: CLOUD_INDEX, headers: {} }]);
    expect(provider).not.toHaveBeenCalled();
  });

  it('sends no headers before any provider is installed', async () => {
    routes[CLOUD_INDEX] = json([entry('a.json')]);
    await fetchIndex();
    expect(requests()).toEqual([{ url: CLOUD_INDEX, headers: {} }]);
  });

  it('uses the local copy, without calling the cloud path, when the credentials fail', async () => {
    setDataHeadersProvider(() => Promise.reject(new Error('token refresh failed')));
    routes[LOCAL_INDEX] = json([entry('graph-lab.json.gz')]);
    await expect(fetchIndex()).resolves.toEqual([entry(`${GRAPH_LAB_BASE}graph-lab.json.gz`)]);
    expect(requests()).toEqual([{ url: LOCAL_INDEX, headers: {} }]);
  });
});

describe('server-supplied index paths (B-44)', () => {
  it.each([
    '../secret.json',
    `versions/${VERSION}/../../current.json`,
    'versions/..',
    '/etc/passwd',
    'https://evil.example/x.json',
    '//evil.example/x.json',
    '.hidden.json',
    '%2e%2e/x.json',
    'a b.json',
    'a\\b.json',
    'x'.repeat(202),
  ])('rejects the cloud index entry %j', async (file) => {
    routes[CLOUD_INDEX] = json([entry('ok.json'), entry(file)]);
    const error = await fetchIndex().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphLabLoadError);
    const cause = error instanceof Error ? error.cause : null;
    // The fallback (404 here) is tried after the bad cloud index; neither is used.
    expect(cause instanceof Error ? cause.message : '').toContain(LOCAL_INDEX);
    expect(requests().map((r) => r.url)).toEqual([CLOUD_INDEX, LOCAL_INDEX]);
  });

  it('uses the fallback instead of a cloud index with an unsafe entry', async () => {
    routes[CLOUD_INDEX] = json([entry('../secret.json')]);
    routes[LOCAL_INDEX] = json([entry('graph-lab.json.gz')]);
    await expect(fetchIndex()).resolves.toEqual([entry(`${GRAPH_LAB_BASE}graph-lab.json.gz`)]);
  });

  it('rejects an unsafe entry in the fallback index too', async () => {
    routes[LOCAL_INDEX] = json([entry('../../index.html')]);
    const error = await fetchIndex().catch((e: unknown) => e);
    const cause = error instanceof Error ? error.cause : null;
    expect(cause).toBeInstanceOf(GraphLabLoadError);
    expect(cause instanceof Error ? cause.message : '').toBe(
      'The bundle index lists an invalid file path.',
    );
  });

  it('accepts plain nested paths up to the length limit', async () => {
    const longest = 'a'.repeat(201);
    routes[CLOUD_INDEX] = json([entry(`versions/${VERSION}/x_1-a.json.gz`), entry(longest)]);
    const files = (await fetchIndex()).map((e) => e.file);
    expect(files).toEqual([
      `${PUBLIC_DATA_BASE}versions/${VERSION}/x_1-a.json.gz`,
      `${PUBLIC_DATA_BASE}${longest}`,
    ]);
  });
});
