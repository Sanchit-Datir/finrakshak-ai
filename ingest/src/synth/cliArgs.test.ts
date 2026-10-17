import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, MAX_CUSTOMERS, parseArgs } from './cliArgs.js';

describe('parseArgs', () => {
  it('has defaults for everything', () => {
    expect(parseArgs([])).toEqual({
      seed: DEFAULT_SEED,
      customers: 200,
      months: 24,
      out: 'data/synthetic',
      sample: false,
    });
  });

  it('reads each option', () => {
    expect(
      parseArgs([
        '--seed',
        '7',
        '--customers',
        '50',
        '--months',
        '18',
        '--out',
        'tmp/x',
        '--sample',
      ]),
    ).toEqual({
      seed: 7,
      customers: 50,
      months: 18,
      out: 'tmp/x',
      sample: true,
    });
  });

  it('accepts the limits and refuses anything beyond them', () => {
    expect(parseArgs(['--customers', String(MAX_CUSTOMERS), '--months', '36']).months).toBe(36);
    expect(parseArgs(['--months', '12']).months).toBe(12);
    for (const bad of [
      ['--seed', '-1'],
      ['--seed', '1.5'],
      ['--seed', 'abc'],
      ['--customers', '0'],
      ['--customers', String(MAX_CUSTOMERS + 1)],
      ['--months', '11'],
      ['--months', '37'],
      ['--out', ''],
    ])
      expect(() => parseArgs(bad), bad.join(' ')).toThrow(/Bad options/);
  });
});
