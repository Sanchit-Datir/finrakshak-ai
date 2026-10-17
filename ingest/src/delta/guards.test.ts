import { describe, expect, it } from 'vitest';
import { assertPlausibleListing, type ListingCheck } from './guards.js';

const check = (over: Partial<ListingCheck>): ListingCheck => ({
  source: 'ibbi',
  fetched: 100,
  activeBefore: 100,
  complete: true,
  allowShrink: false,
  ...over,
});
const run = (over: Partial<ListingCheck>): (() => void) => {
  return () => {
    assertPlausibleListing(check(over));
  };
};

describe('assertPlausibleListing', () => {
  it('accepts a first run, a normal relist and small sources', () => {
    expect(run({ activeBefore: 0, fetched: 0 })).not.toThrow();
    expect(run({ fetched: 98 })).not.toThrow();
    expect(run({ activeBefore: 10, fetched: 2 })).not.toThrow();
  });

  it('rejects an empty listing in every mode once the source has items', () => {
    expect(run({ fetched: 0 })).toThrow(/no items/);
    expect(run({ fetched: 0, complete: false })).toThrow(/no items/);
    expect(run({ fetched: 0, allowShrink: true })).toThrow(/no items/);
  });

  it('rejects a complete relist that lost more than half, unless confirmed', () => {
    expect(run({ fetched: 49 })).toThrow(/shrank from 100 to 49/);
    expect(run({ fetched: 50 })).not.toThrow();
    expect(run({ fetched: 49, allowShrink: true })).not.toThrow();
    expect(run({ fetched: 49, complete: false })).not.toThrow();
  });
});
