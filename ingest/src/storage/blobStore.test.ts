import { describe, expect, it } from 'vitest';
import { joinKey } from './blobStore.js';

describe('joinKey', () => {
  it('joins segments with single slashes', () => {
    expect(joinKey('interim', 'listings/', '/ibbi.jsonl')).toBe('interim/listings/ibbi.jsonl');
    expect(joinKey('a//b', '', 'c')).toBe('a/b/c');
  });
  it('rejects traversal so a key can never leave the data root', () => {
    expect(() => joinKey('interim', '..', 'x')).toThrow(/Invalid storage key/);
    expect(() => joinKey('a/./b')).toThrow(/Invalid storage key/);
  });
});
