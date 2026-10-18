import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ListingItem } from '@finrakshak-ai/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { runDownloads, runListing } from '../acquire.js';
import { dataPath } from '../config.js';
import type { FetchResult } from '../http/fetcher.js';
import type { SourceAdapter, SourceContext } from '../sources/types.js';
import { RawStore } from '../store/rawStore.js';
import { FULL_PLAN } from './policy.js';

const item = (urls: readonly string[], title = 'Prosecution list'): ListingItem => ({
  item_id: 'x',
  source_id: 'sfio',
  collection: 'sfio.prosecution',
  title,
  detail_url: null,
  document_urls: [...urls],
  published_date: '2026-10-01',
  fields: {},
  listed_at: '2026-10-01T00:00:00.000Z',
});

let rows: ListingItem[] = [];
let resolveCalls = 0;
const fetched: string[] = [];
let content = 'v1';
const adapter: SourceAdapter = {
  id: 'sfio',
  termsNote: 'test terms',
  list: () => Promise.resolve(rows),
  resolveDocuments: (i) => {
    resolveCalls++;
    return Promise.resolve(i.document_urls);
  },
};
const fetcher = {
  fetch: (url: string): Promise<FetchResult> => {
    fetched.push(url);
    const body = Buffer.from(`%PDF ${url} ${content}`);
    return Promise.resolve({
      url,
      finalUrl: url,
      status: 200,
      contentType: 'application/pdf',
      body,
    });
  },
};
const ctxAt = async (runAt: string): Promise<SourceContext> => ({
  // Only `fetch` is used by the download step.
  fetcher: fetcher as unknown as SourceContext['fetcher'],
  store: await RawStore.open('sfio'),
  runAt,
  listing: FULL_PLAN,
});
const A = 'https://sfio.gov.in/a.pdf';
const B = 'https://sfio.gov.in/b.pdf';

beforeAll(() => {
  process.env['FINRAKSHAK_AI_DATA_DIR'] = mkdtempSync(path.join(tmpdir(), 'finrakshak-ai-dl-'));
});

describe('runDownloads with refresh', () => {
  it('downloads once and skips known URLs on later runs', async () => {
    rows = [item([A])];
    const ctx = await ctxAt('2026-10-10T03:00:00.000Z');
    await runListing(adapter, ctx);
    await runDownloads(adapter, ctx, 10);
    await runDownloads(adapter, await ctxAt('2026-10-11T03:00:00.000Z'), 10);
    expect([resolveCalls, fetched]).toEqual([1, [A]]);
  });

  it('re-resolves a changed item, so a new document URL is fetched', async () => {
    rows = [item([B])];
    const ctx = await ctxAt('2026-10-12T03:00:00.000Z');
    const report = await runListing(adapter, ctx);
    expect(report.changed).toEqual(['x']);
    await runDownloads(adapter, ctx, 10, new Set(report.changed));
    expect([resolveCalls, fetched]).toEqual([2, [A, B]]);
  });

  it('re-fetches a changed item at the same URL and stores a new version', async () => {
    rows = [item([B], 'Prosecution list (updated)')];
    content = 'v2';
    const ctx = await ctxAt('2026-10-13T03:00:00.000Z');
    const report = await runListing(adapter, ctx);
    await runDownloads(adapter, ctx, 10, new Set(report.changed));
    expect(fetched).toEqual([A, B, B]);
    const manifest = readFileSync(dataPath('raw', 'sfio', 'manifest.jsonl'), 'utf8');
    const versions = manifest.split('\n').filter((line) => line.includes(B));
    expect(versions).toHaveLength(2); // the old version stays; the changed file is a new line
  });
});

describe('runDownloads failure', () => {
  it('fails the step when every selected item fails, so the run summary shows it', async () => {
    const broken: SourceAdapter = {
      ...adapter,
      resolveDocuments: () => Promise.reject(new Error('detail page moved')),
    };
    rows = [item([A], 'Another list')];
    const ctx = await ctxAt('2026-10-14T03:00:00.000Z');
    const report = await runListing(broken, ctx);
    await expect(runDownloads(broken, ctx, 10, new Set(report.changed))).rejects.toThrow(
      /all 1 selected items failed/,
    );
  });
});
