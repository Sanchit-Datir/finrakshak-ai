import { describe, expect, it } from 'vitest';
import { assertFirstPageHasRows, chooseMode, makePlan, shouldStopPaging } from './policy.js';
import type { SourceState } from './state.js';

const state = (lastFull: string | null): SourceState => ({
  source_id: 'ibbi',
  last_success_at: '2026-10-10T00:00:00.000Z',
  last_full_listing_at: lastFull,
  item_count: 10,
  missing_ids: [],
});

describe('chooseMode', () => {
  const now = '2026-10-17T00:00:00.000Z';
  it('lists in full on the first run, when forced, or for sources without paging', () => {
    expect(chooseMode('ibbi', null, now, false)).toBe('full');
    expect(chooseMode('ibbi', state(null), now, false)).toBe('full');
    expect(chooseMode('ibbi', state('2026-10-16T00:00:00.000Z'), now, true)).toBe('full');
    expect(chooseMode('ed', state('2026-10-16T00:00:00.000Z'), now, false)).toBe('full');
  });
  it('runs incrementally until the weekly (IBBI) or monthly (RBI, SEBI full index) full relist is due', () => {
    // The SEBI sample is capped, never records a full relist and so always lists in full.
    expect(chooseMode('sebi', state(null), now, false)).toBe('full');
    expect(chooseMode('sebi', state('2026-10-16T00:00:00.000Z'), now, false)).toBe('incremental');
    expect(chooseMode('ibbi', state('2026-10-11T00:00:00.000Z'), now, false)).toBe('incremental');
    expect(chooseMode('ibbi', state('2026-10-10T00:00:00.000Z'), now, false)).toBe('full');
    expect(chooseMode('rbi', state('2026-09-25T00:00:00.000Z'), now, false)).toBe('incremental');
    expect(chooseMode('rbi', state('2026-09-17T00:00:00.000Z'), now, false)).toBe('full');
  });
});

describe('paging helpers', () => {
  const plan = makePlan('incremental', [
    {
      item_id: 'a',
      source_id: 'ibbi',
      collection: 'c',
      title: 't',
      detail_url: null,
      document_urls: [],
      published_date: null,
      fields: {},
      listed_at: '2026-10-01T00:00:00.000Z',
    },
  ]);
  it('stops only an incremental run on a page of known items', () => {
    expect(shouldStopPaging(plan, ['a'])).toBe(true);
    expect(shouldStopPaging(plan, ['a', 'new'])).toBe(false);
    expect(shouldStopPaging({ ...plan, mode: 'full' }, ['a'])).toBe(false);
    expect(shouldStopPaging(plan, [])).toBe(false); // an empty or error page never ends a run
  });
  it('rejects an empty first page for a collection that was listed before', () => {
    expect(() => {
      assertFirstPageHasRows(plan, 'c', 0, 'https://x.test/');
    }).toThrow(/No rows/);
    expect(() => {
      assertFirstPageHasRows(plan, 'other', 0, 'https://x.test/');
    }).not.toThrow();
    expect(() => {
      assertFirstPageHasRows(plan, 'c', 3, 'https://x.test/');
    }).not.toThrow();
  });
});
