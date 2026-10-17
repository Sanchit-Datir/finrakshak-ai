import { describe, expect, it } from 'vitest';
import type { DirectResult } from './direct.js';
import type { PatternLayerResult } from './patternLayer.js';
import { bandOf, combineLayers, isStale, scoreIdOf, type CombineInput } from './score.js';
import { SCORING_SETTINGS_V1 as S } from './settings.js';
import type { LayerResult } from './types.js';

const layer = (points: number): LayerResult => ({ points, reasons: [] });
const direct = (points: number, override = false): DirectResult => ({ ...layer(points), override });
const pattern = (points: number, noPatterns = false): PatternLayerResult => ({
  ...layer(points),
  findings: [],
  noPatterns,
});
const input = (over: Partial<CombineInput> = {}): CombineInput => ({
  loanId: 'L-1',
  borrowerId: 'B-1',
  asOf: '2024-12-31',
  dataBuiltOn: '2024-12-30',
  missingInputs: [],
  patternVersion: 1,
  direct: direct(0),
  pattern: pattern(0),
  graph: layer(0),
  behaviour: layer(0),
  ...over,
});

describe('bands', () => {
  it.each([
    [0, 'routine'],
    [29, 'routine'],
    [30, 'needs_attention'],
    [59, 'needs_attention'],
    [60, 'urgent'],
    [100, 'urgent'],
  ] as const)('%i is %s', (score, band) => {
    expect(bandOf(score, S)).toBe(band);
  });
});

describe('combining the layers', () => {
  it('adds the layers and records their points', () => {
    const s = combineLayers(
      input({ direct: direct(25), pattern: pattern(18), graph: layer(10), behaviour: layer(4) }),
      S,
    );
    expect(s).toMatchObject({ score: 57, band: 'needs_attention', override: false });
    expect(s.points).toEqual({ direct: 25, pattern: 18, graph: 10, behaviour: 4 });
  });

  it('caps the total at 100', () => {
    const s = combineLayers(
      input({ direct: direct(40), pattern: pattern(30), graph: layer(20), behaviour: layer(20) }),
      S,
    );
    expect(s.score).toBe(100);
  });

  it('goes straight to Urgent review on the override, whatever the score', () => {
    const s = combineLayers(input({ direct: direct(0, true) }), S);
    expect(s).toMatchObject({ score: 0, band: 'urgent', override: true });
  });

  it('stores the settings and pattern versions and the data date (B-43)', () => {
    const s = combineLayers(input({ patternVersion: 7 }), S);
    expect(s).toMatchObject({
      settings_version: 'v1',
      pattern_version: 7,
      data_built_on: '2024-12-30',
    });
  });

  it('marks no_patterns from the pattern layer (B-56)', () => {
    expect(combineLayers(input({ pattern: pattern(0, true) }), S).no_patterns).toBe(true);
  });

  it('has a deterministic score id (B-24)', () => {
    expect(scoreIdOf('L-1', '2024-12-31', 'v1', 3)).toBe('score_L-1_2024-12-31_v1_p3');
    expect(scoreIdOf('L-1', '2024-12-31', 'v1', null)).toBe('score_L-1_2024-12-31_v1_pnone');
    expect(combineLayers(input(), S).score_id).toBe(combineLayers(input(), S).score_id);
  });
});

describe('stale inputs (B-56)', () => {
  it('counts public data stale after 7 days, not at 7', () => {
    expect(isStale('2024-12-24', '2024-12-31', S)).toBe(false);
    expect(isStale('2024-12-23', '2024-12-31', S)).toBe(true);
    expect(combineLayers(input({ dataBuiltOn: '2024-12-23' }), S).stale_inputs).toBe(true);
    expect(combineLayers(input({ dataBuiltOn: '2024-12-24' }), S).stale_inputs).toBe(false);
  });

  it('marks the score stale when an input is missing', () => {
    expect(combineLayers(input({ missingInputs: ['public_records'] }), S).stale_inputs).toBe(true);
  });
});
