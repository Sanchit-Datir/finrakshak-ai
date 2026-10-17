import type { ListingItem } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { diffListings, itemFingerprint, mergeListing } from './diff.js';

const item = (id: string, over: Partial<ListingItem> = {}): ListingItem => ({
  item_id: id,
  source_id: 'ibbi',
  collection: 'ibbi.public_announcements',
  title: `Title ${id}`,
  detail_url: null,
  document_urls: [],
  published_date: '2026-10-01',
  fields: { a: '1' },
  listed_at: '2026-10-01T00:00:00.000Z',
  ...over,
});
const none = { evaluateRemoved: true, alreadyMissing: new Set<string>() };

describe('diffListings', () => {
  it('reports nothing when the listing is unchanged, even with a new listed_at', () => {
    const prev = [item('a'), item('b')];
    const now = prev.map((i) => ({ ...i, listed_at: '2026-10-02T00:00:00.000Z' }));
    expect(diffListings(prev, now, none)).toEqual({
      added: [],
      changed: [],
      removed: [],
      unchanged: 2,
    });
  });

  it('finds added, changed and removed items', () => {
    const prev = [item('a'), item('b'), item('c')];
    const now = [item('a'), item('b', { title: 'Edited' }), item('d')];
    expect(diffListings(prev, now, none)).toEqual({
      added: ['d'],
      changed: ['b'],
      removed: ['c'],
      unchanged: 1,
    });
  });

  it('does not report removals for a partial listing or items already flagged', () => {
    const prev = [item('a'), item('c')];
    expect(diffListings(prev, [], { ...none, evaluateRemoved: false }).removed).toEqual([]);
    expect(diffListings(prev, [], { ...none, alreadyMissing: new Set(['a']) }).removed).toEqual([
      'c',
    ]);
  });

  it('handles an empty previous listing and an empty current listing', () => {
    expect(diffListings([], [item('a')], none).added).toEqual(['a']);
    expect(diffListings([], [], none)).toEqual({
      added: [],
      changed: [],
      removed: [],
      unchanged: 0,
    });
  });

  it('treats field order as irrelevant but field values as changes', () => {
    const one = item('a', { fields: { x: '1', y: '2' } });
    const reordered = item('a', { fields: { y: '2', x: '1' } });
    expect(itemFingerprint(one)).toBe(itemFingerprint(reordered));
    expect(itemFingerprint(one)).not.toBe(itemFingerprint(item('a', { fields: { x: '9' } })));
  });
});

describe('mergeListing', () => {
  it('keeps unchanged records, replaces changed ones in place, appends new ones and keeps removed', () => {
    const old = item('a', { listed_at: '2026-01-01T00:00:00.000Z' });
    const merged = mergeListing(
      [old, item('b'), item('gone')],
      [
        item('a', { listed_at: '2026-10-02T00:00:00.000Z' }),
        item('b', { title: 'New' }),
        item('n'),
      ],
    );
    expect(merged.map((i) => i.item_id)).toEqual(['a', 'b', 'gone', 'n']);
    expect(merged[0]?.listed_at).toBe('2026-01-01T00:00:00.000Z');
    expect(merged[1]?.title).toBe('New');
  });
});
