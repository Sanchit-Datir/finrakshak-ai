import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ListingItem } from '@finrakshak-ai/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataPath } from '../config.js';
import { runListing } from '../acquire.js';
import type { SourceAdapter, SourceContext } from '../sources/types.js';
import { FULL_PLAN } from './policy.js';
import { readState } from './state.js';

const item = (id: string, title = `T ${id}`): ListingItem => ({
  item_id: id,
  source_id: 'ibbi',
  collection: 'ibbi.public_announcements',
  title,
  detail_url: null,
  document_urls: [],
  published_date: '2026-10-01',
  fields: {},
  listed_at: '2026-10-01T00:00:00.000Z',
});

let rows: ListingItem[] = [];
const calls: string[] = [];
const adapter: SourceAdapter = {
  id: 'ibbi',
  termsNote: 'test',
  list: (ctx) => {
    calls.push(ctx.listing.mode);
    return Promise.resolve(rows);
  },
  resolveDocuments: () => Promise.resolve([]),
};
const ctxAt = (runAt: string): SourceContext => ({
  // The adapter above never touches the fetcher or the store.
  fetcher: {} as SourceContext['fetcher'],
  store: {} as SourceContext['store'],
  runAt,
  listing: FULL_PLAN,
});
const listingText = (): string =>
  readFileSync(dataPath('interim', 'listings', 'ibbi.jsonl'), 'utf8');

beforeAll(() => {
  process.env['FINRAKSHAK_AI_DATA_DIR'] = mkdtempSync(path.join(tmpdir(), 'finrakshak-ai-delta-'));
});

describe('runListing', () => {
  it('first run is a full listing and reports everything as added', async () => {
    rows = [item('a'), item('b')];
    const report = await runListing(adapter, ctxAt('2026-10-10T03:00:00.000Z'));
    expect(report).toMatchObject({ mode: 'full', total_after: 2 });
    expect(report.added).toEqual(['a', 'b']);
    expect((await readState('ibbi'))?.last_full_listing_at).toBe('2026-10-10T03:00:00.000Z');
  });

  it('a second run with the same data is incremental, reports zero delta and leaves the listing identical', async () => {
    const before = listingText();
    const report = await runListing(adapter, ctxAt('2026-10-11T03:00:00.000Z'));
    expect(report).toMatchObject({ mode: 'incremental', unchanged: 2 });
    expect([report.added, report.changed, report.removed]).toEqual([[], [], []]);
    expect(listingText()).toBe(before);
    expect(calls).toEqual(['full', 'incremental']);
  });

  it('an incremental run merges new and changed items without dropping older ones', async () => {
    rows = [item('c'), item('a', 'Edited')];
    const report = await runListing(adapter, ctxAt('2026-10-12T03:00:00.000Z'));
    expect(report).toMatchObject({ mode: 'incremental', total_after: 3 });
    expect([report.added, report.changed, report.removed]).toEqual([['c'], ['a'], []]);
    expect(listingText().split('\n').filter(Boolean)).toHaveLength(3);
  });

  it('the weekly full relist flags a disappeared item once and keeps it in the listing', async () => {
    rows = [item('a', 'Edited'), item('c')];
    const first = await runListing(adapter, ctxAt('2026-10-17T03:00:00.000Z'));
    expect(first).toMatchObject({ mode: 'full', total_after: 3 });
    expect(first.removed).toEqual(['b']);
    expect((await readState('ibbi'))?.missing_ids).toEqual(['b']);
    const second = await runListing(adapter, ctxAt('2026-10-17T04:00:00.000Z'), {
      forceFull: true,
    });
    expect(second.removed).toEqual([]);
    rows = [item('a', 'Edited'), item('b'), item('c')];
    await runListing(adapter, ctxAt('2026-10-17T05:00:00.000Z'), { forceFull: true });
    expect((await readState('ibbi'))?.missing_ids).toEqual([]);
  });

  it('keeps the stored listing and state when a full relist comes back empty or the adapter throws', async () => {
    const before = listingText();
    const state = await readState('ibbi');
    rows = [];
    await expect(
      runListing(adapter, ctxAt('2026-10-18T03:00:00.000Z'), { forceFull: true }),
    ).rejects.toThrow(/no items/);
    const failing: SourceAdapter = { ...adapter, list: () => Promise.reject(new Error('layout')) };
    await expect(runListing(failing, ctxAt('2026-10-18T03:00:00.000Z'))).rejects.toThrow('layout');
    expect(listingText()).toBe(before);
    expect(await readState('ibbi')).toEqual(state);
  });

  it('writes a timestamped delta report per run', () => {
    const files = readdirSync(dataPath('interim', 'delta', 'ibbi'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.every((f) => f.endsWith('.json') && !f.includes(':'))).toBe(true);
  });
});

describe('runListing guards for capped and shrinking listings', () => {
  const ctxCapped = (runAt: string): SourceContext => ({ ...ctxAt(runAt), maxItems: 2 });
  const sebi: SourceAdapter = { ...adapter, id: 'sebi' };
  const nfra: SourceAdapter = { ...adapter, id: 'nfra' };
  const many = (n: number): ListingItem[] => Array.from({ length: n }, (_, i) => item(`n${i}`));

  it('a capped sample never reports removals or counts as a full relist', async () => {
    rows = [item('s1'), item('s2')];
    await runListing(sebi, ctxCapped('2026-10-10T03:00:00.000Z'));
    rows = [item('s3'), item('s1')];
    const report = await runListing(sebi, ctxCapped('2026-10-11T03:00:00.000Z'));
    expect(report).toMatchObject({ mode: 'full', complete: false, total_after: 3, removed: [] });
    expect((await readState('sebi'))?.last_full_listing_at).toBeNull();
  });

  it('refuses a complete relist that lost most items unless --allow-shrink confirms it', async () => {
    rows = many(30);
    await runListing(nfra, ctxAt('2026-10-10T03:00:00.000Z'));
    rows = many(10);
    const at = ctxAt('2026-10-17T03:00:00.000Z');
    await expect(runListing(nfra, at)).rejects.toThrow(/shrank from 30 to 10/);
    const report = await runListing(nfra, at, { allowShrink: true });
    expect(report.removed).toHaveLength(20);
    expect(report.total_after).toBe(30);
  });
});
