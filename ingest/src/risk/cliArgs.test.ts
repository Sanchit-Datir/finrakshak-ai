import { describe, expect, it } from 'vitest';
import { parseArgs } from './cliArgs.js';

describe('score CLI options', () => {
  it('defaults to the synthetic folder and the hand-written library', () => {
    expect(parseArgs([], {})).toEqual({
      in: 'data/synthetic',
      out: 'data/synthetic',
      patterns: 'code',
      seedReview: 'data/verification/seed_review.json',
      dataBuiltOn: null,
      withinMonths: 2,
      settings: 'v2',
    });
  });

  it('takes the library file from FINRAKSHAK_AI_PATTERN_LIBRARY, and --patterns over it', () => {
    expect(parseArgs([], { FINRAKSHAK_AI_PATTERN_LIBRARY: 'lib.json' }).patterns).toBe('lib.json');
    expect(
      parseArgs(['--patterns', 'code'], { FINRAKSHAK_AI_PATTERN_LIBRARY: 'lib.json' }).patterns,
    ).toBe('code');
  });

  it('takes a published settings version, and rejects a malformed one', () => {
    expect(parseArgs(['--settings', 'v1'], {}).settings).toBe('v1');
    expect(() => parseArgs(['--settings', 'latest'], {})).toThrow(/settings/);
  });

  it('rejects a bad date or month count with a readable message', () => {
    expect(() => parseArgs(['--data-built-on', '2024-13-01'], {})).toThrow(/dataBuiltOn/);
    expect(() => parseArgs(['--within-months', 'two'], {})).toThrow(/withinMonths/);
    expect(parseArgs(['--data-built-on', '2024-12-01', '--within-months', '0'], {})).toMatchObject({
      dataBuiltOn: '2024-12-01',
      withinMonths: 0,
    });
  });
});
