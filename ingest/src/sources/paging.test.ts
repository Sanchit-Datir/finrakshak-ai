import type { ListingItem } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import { makePlan, FULL_PLAN, type ListingPlan } from '../delta/policy.js';
import { ibbiAdapter } from './ibbi.js';
import { nfraAdapter } from './nfra.js';
import { rbiAdapter, RBI_FIRST_YEAR } from './rbi.js';
import type { SourceContext } from './types.js';

const RUN = '2026-10-17T00:00:00.000Z';

/** Serves canned pages by URL and records every URL asked for. */
function fakeContext(
  pages: Readonly<Record<string, string>>,
  listing: ListingPlan,
): { ctx: SourceContext; requested: string[] } {
  const requested: string[] = [];
  const fetcher = {
    fetch: (url: string) => {
      requested.push(url);
      const body = pages[url];
      return Promise.resolve({
        status: body === undefined ? 404 : 200,
        finalUrl: url,
        body: Buffer.from(body ?? ''),
      });
    },
  };
  // Only `fetch` is used by the listing code under test.
  const ctx = { fetcher, store: {}, runAt: RUN, listing } as unknown as SourceContext;
  return { ctx, requested };
}

const ibbiPage = (debtors: readonly string[], last = 3): string =>
  `<a href="/public-announcement?page=${last}">last</a><table>
  <tr><th>Name of Corporate Debtor</th><th>Type of PA</th><th>Date of Announcement</th></tr>
  ${debtors.map((d) => `<tr><td>${d}</td><td>CIRP</td><td>01-10-2026</td></tr>`).join('')}</table>`;

const IBBI = 'https://ibbi.gov.in/public-announcement';
const ibbiPages = {
  [IBBI]: ibbiPage(['New Co', 'Known A']),
  [`${IBBI}?page=2`]: ibbiPage(['Known B', 'Known C']),
  [`${IBBI}?page=3`]: ibbiPage(['Known D']),
};

describe('IBBI listing', () => {
  it('walks every page on a full listing', async () => {
    const { ctx, requested } = fakeContext(ibbiPages, FULL_PLAN);
    expect(await ibbiAdapter.list(ctx)).toHaveLength(5);
    expect(requested.filter((u) => u.includes('public-announcement'))).toHaveLength(3);
  });

  it('stops an incremental run at the first page that holds only known items', async () => {
    const full = await ibbiAdapter.list(fakeContext(ibbiPages, FULL_PLAN).ctx);
    const known: ListingItem[] = full.filter((i) => i.title !== 'CIRP: New Co');
    const { ctx, requested } = fakeContext(ibbiPages, makePlan('incremental', known));
    const items = await ibbiAdapter.list(ctx);
    expect(items.map((i) => i.title)).toEqual([
      'CIRP: New Co',
      'CIRP: Known A',
      'CIRP: Known B',
      'CIRP: Known C',
    ]);
    expect(requested.some((u) => u.endsWith('page=3'))).toBe(false);
  });

  it('does not end an incremental run on an empty page in the middle', async () => {
    const full = await ibbiAdapter.list(fakeContext(ibbiPages, FULL_PLAN).ctx);
    const pages = { ...ibbiPages, [`${IBBI}?page=2`]: '<html>temporarily unavailable</html>' };
    const { ctx, requested } = fakeContext(pages, makePlan('incremental', full.slice(1)));
    await ibbiAdapter.list(ctx);
    expect(requested.some((u) => u.endsWith('page=3'))).toBe(true);
  });

  it('fails instead of returning nothing when a known page suddenly has no rows', async () => {
    const full = await ibbiAdapter.list(fakeContext(ibbiPages, FULL_PLAN).ctx);
    const { ctx } = fakeContext(
      { [IBBI]: '<html>maintenance</html>' },
      makePlan('incremental', full),
    );
    await expect(ibbiAdapter.list(ctx)).rejects.toThrow(/No rows parsed/);
  });
});

describe('S3waaS listing (NFRA)', () => {
  const orders = 'https://nfra.gov.in/document-category/orders/';
  const table = (titles: readonly string[]): string =>
    `<table><tr><th>Title</th><th>Date</th><th>View</th></tr>${titles
      .map((t) => `<tr><td>${t}</td><td>01-10-2026</td><td><a href="/${t}.pdf">pdf</a></td></tr>`)
      .join('')}</table>`;
  const pages = {
    [orders]: table(['o1', 'o2']),
    [`${orders}page/2/`]: table(['o3', 'o4']),
    [`${orders}page/3/`]: table(['o5']),
  };

  it('stops each category at the first page of known items', async () => {
    const full = await nfraAdapter.list(fakeContext(pages, FULL_PLAN).ctx);
    expect(full).toHaveLength(5);
    const known = full.filter((i) => ['o3', 'o4', 'o5'].includes(i.title));
    const { ctx, requested } = fakeContext(pages, makePlan('incremental', known));
    const items = await nfraAdapter.list(ctx);
    expect(items.map((i) => i.title)).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(requested).not.toContain(`${orders}page/3/`);
  });

  it('fails when the first page of a category we hold is gone (404)', async () => {
    const full = await nfraAdapter.list(fakeContext(pages, FULL_PLAN).ctx);
    const { ctx } = fakeContext({}, makePlan('incremental', full));
    await expect(nfraAdapter.list(ctx)).rejects.toThrow(/No rows parsed from .*orders/);
  });
});

describe('RBI listing', () => {
  const RBI = 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx';
  const page = `<table class="tablebg"><tr><td>Oct 16, 2026</td></tr>
    <tr><td><a href="BS_PressReleaseDisplay.aspx?prid=1">Penalty on ABC Bank</a></td></tr></table>`;

  const yearsAsked = (listing: ListingPlan): Promise<number> => {
    const posted: string[] = [];
    const base = fakeContext({ [RBI]: page }, listing);
    const fetcher = {
      fetch: (url: string, opts?: { form?: Record<string, string> }) => {
        if (opts?.form) posted.push(opts.form['hdnYear'] ?? '');
        return base.ctx.fetcher.fetch(url);
      },
    };
    const ctx = { ...base.ctx, fetcher } as unknown as SourceContext;
    return rbiAdapter.list(ctx).then(() => posted.length);
  };

  it('lists every year in full mode but only this and last year incrementally', async () => {
    expect(await yearsAsked(FULL_PLAN)).toBe(2026 - RBI_FIRST_YEAR + 1);
    const known = await rbiAdapter.list(fakeContext({ [RBI]: page }, FULL_PLAN).ctx);
    expect(await yearsAsked(makePlan('incremental', known))).toBe(2);
  });
});
