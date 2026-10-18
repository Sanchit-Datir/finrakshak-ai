import type { GraphLabBundle, PublishedVersion } from '@finrakshak-ai/shared';
import { describe, expect, it } from 'vitest';
import {
  allPassed,
  evaluateGates,
  MAX_BUNDLE_BYTES,
  seedCasesIn,
  type GateInput,
} from './gates.js';

const graph = (seeds: string[][]): GraphLabBundle =>
  ({ nodes: seeds.map((s, i) => ({ id: `n${i}`, seed_cases: s })) }) as unknown as GraphLabBundle;
const rows = { documents: 100, case_events: 100, entities: 50, relationships: 80, addresses: 10 };
const previous = (over: Partial<PublishedVersion> = {}): PublishedVersion => ({
  version: '2026-10-16T03-05-00-000Z',
  built_at: '2026-10-16T03:05:00.000Z',
  published_at: '2026-10-16T03:10:00.000Z',
  run_id: 'run_prev',
  files: [{ file: 'graph-lab.json.gz', label: 'real', synthetic: false }],
  rows,
  seed_cases: ['dhfl'],
  bundle_bytes: 1,
  gates: [],
  ...over,
});
const input = (over: Partial<GateInput> = {}): GateInput => ({
  stats: { built_at: '2026-10-17T03:05:00.000Z', listed_items: {}, mca_master: null, rows },
  graph: graph([['dhfl'], []]),
  bundleBytes: 5 * 1024 * 1024,
  previous: previous(),
  maxDrop: 0.2,
  ...over,
});
const failed = (i: GateInput): string[] =>
  evaluateGates(i)
    .filter((g) => !g.passed)
    .map((g) => g.id);

describe('publish gates (B-50)', () => {
  it('pass a normal build and a first publish', () => {
    expect(allPassed(evaluateGates(input()))).toBe(true);
    expect(allPassed(evaluateGates(input({ previous: null })))).toBe(true);
  });

  it('fail on an empty required table (also a drop when there was a published build)', () => {
    const empty = { ...input().stats, rows: { ...rows, entities: 0 } };
    expect(failed(input({ stats: empty, previous: null }))).toEqual(['required_tables']);
    expect(failed(input({ stats: empty }))).toEqual(['required_tables', 'max_row_drop']);
  });

  it('allow a drop of exactly the limit but not more', () => {
    const at = (n: number): GateInput =>
      input({ stats: { ...input().stats, rows: { ...rows, documents: n } } });
    expect(failed(at(80))).toEqual([]);
    expect(failed(at(79))).toEqual(['max_row_drop']);
    // A table that was empty before cannot "drop".
    expect(
      failed(
        input({
          previous: previous({ rows: { ...rows, addresses: 0 } }),
          stats: { ...input().stats, rows: { ...rows, addresses: 0 } },
        }),
      ),
    ).toEqual([]);
  });

  it('cap the bundle size at the maximum (B-41)', () => {
    expect(failed(input({ bundleBytes: MAX_BUNDLE_BYTES }))).toEqual([]);
    expect(failed(input({ bundleBytes: MAX_BUNDLE_BYTES + 1 }))).toEqual(['bundle_size']);
  });

  it('refuse a build that is not newer than the published one', () => {
    expect(
      failed(input({ stats: { ...input().stats, built_at: '2026-10-16T03:05:00.000Z' } })),
    ).toEqual(['newer_than_published']);
  });

  it('refuse to lose a seed case silently', () => {
    expect(failed(input({ graph: graph([['ilfs']]) }))).toEqual(['seed_cases_kept']);
    expect(seedCasesIn(graph([['b', 'a'], ['a']]))).toEqual(['a', 'b']);
  });
});
