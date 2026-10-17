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
    });
  });

  it('takes the library file from FUNDTRACE_PATTERN_LIBRARY, and --patterns over it', () => {
    expect(parseArgs([], { FUNDTRACE_PATTERN_LIBRARY: 'lib.json' }).patterns).toBe('lib.json');
    expect(
      parseArgs(['--patterns', 'code'], { FUNDTRACE_PATTERN_LIBRARY: 'lib.json' }).patterns,
    ).toBe('code');
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
