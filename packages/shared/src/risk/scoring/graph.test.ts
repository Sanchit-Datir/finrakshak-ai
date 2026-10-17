import { describe, expect, it } from 'vitest';
import type { FlaggedNeighbour } from '../patterns/timeline.js';
import type { RecordKind } from '../recordKinds.js';
import { flaggedNeighbours, graphLayer } from './graph.js';
import type { ScoringLink } from './inputs.js';
import { DEFAULT_SCORING_SETTINGS as S } from './settings.js';

const link = (
  from: string,
  to: string,
  status = 'verified',
  type = 'director_of',
): ScoringLink => ({
  from,
  to,
  type,
  status,
});
const flagged = (...ids: string[]): Map<string, RecordKind[]> =>
  new Map(ids.map((id) => [id, ['insolvency']]));

describe('flagged neighbours', () => {
  it('finds flagged entities by shortest hops, at most three', () => {
    const links = [link('B', 'A'), link('A', 'C'), link('C', 'D'), link('D', 'E')];
    const n = flaggedNeighbours('B', links, flagged('A', 'C', 'D', 'E'), 25);
    expect(n.map((x) => [x.entity_id, x.hops])).toEqual([
      ['A', 1],
      ['C', 2],
      ['D', 3],
    ]);
  });

  it('marks a path as weak as its weakest link, keeping the strongest equal-length path', () => {
    const links = [link('B', 'A', 'inferred'), link('A', 'X'), link('B', 'C'), link('C', 'X')];
    const n = flaggedNeighbours('B', links, flagged('A', 'X'), 25);
    expect(n).toContainEqual(expect.objectContaining({ entity_id: 'A', link_status: 'inferred' }));
    expect(n).toContainEqual(
      expect.objectContaining({ entity_id: 'X', hops: 2, link_status: 'verified' }),
    );
  });

  it('marks hubs and never walks through them (B-40)', () => {
    const spokes = Array.from({ length: 25 }, (_, i) => link('HUB', `S${i}`));
    const n = flaggedNeighbours('B', [link('B', 'HUB'), ...spokes], flagged('HUB', 'S1'), 25);
    expect(n).toEqual([expect.objectContaining({ entity_id: 'HUB', is_hub: true })]);
    const small = flaggedNeighbours(
      'B',
      [link('B', 'HUB'), ...spokes.slice(0, 23)],
      flagged('S1'),
      25,
    );
    expect(small.map((x) => x.entity_id)).toEqual(['S1']);
    const edge = flaggedNeighbours(
      'B',
      [link('B', 'HUB'), ...spokes.slice(0, 24)],
      flagged('S1'),
      25,
    );
    expect(edge).toEqual([]);
  });

  it('ignores account links', () => {
    expect(
      flaggedNeighbours('B', [link('B', 'A', 'verified', 'account_of')], flagged('A'), 25),
    ).toEqual([]);
  });
});

describe('graph proximity layer', () => {
  const n = (
    entity_id: string,
    hops: 1 | 2 | 3,
    link_status: 'verified' | 'inferred' = 'verified',
  ): FlaggedNeighbour => ({
    entity_id,
    hops,
    link_status,
    kinds: ['insolvency'],
    is_hub: false,
  });

  it('scores 20 / 10 / 0 by hops, and half for an inferred link', () => {
    expect(graphLayer('B', [n('A', 1)], new Set(), S).points).toBe(20);
    expect(graphLayer('B', [n('A', 2)], new Set(), S).points).toBe(10);
    expect(graphLayer('B', [n('A', 3)], new Set(), S).points).toBe(0);
    expect(graphLayer('B', [n('A', 1, 'inferred')], new Set(), S).points).toBe(10);
    expect(graphLayer('B', [n('A', 2, 'inferred')], new Set(), S).points).toBe(5);
  });

  it('takes the closest neighbour, not the sum', () => {
    const r = graphLayer('B', [n('A', 1), n('C', 1), n('D', 2)], new Set(), S);
    expect(r.points).toBe(20);
    expect(r.reasons).toHaveLength(3);
  });

  it('leaves out hubs and entities the direct layer already counted', () => {
    expect(graphLayer('B', [{ ...n('A', 1), is_hub: true }], new Set(), S).points).toBe(0);
    expect(graphLayer('B', [n('A', 1)], new Set(['A']), S).points).toBe(0);
  });
});
