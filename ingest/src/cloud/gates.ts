import type { GateResult, GraphLabBundle, PublishedVersion } from '@finrakshak-ai/shared';
import type { DatasetStats } from '../dataset/build.js';

/** Everything a gate may look at. Gates are pure: no I/O, so they are cheap to add and reason about. */
export interface GateInput {
  readonly stats: DatasetStats;
  readonly graph: GraphLabBundle;
  readonly bundleBytes: number;
  readonly previous: PublishedVersion | null;
  readonly maxDrop: number;
}

export interface Gate {
  readonly id: string;
  check(input: GateInput): GateResult;
}

const result = (id: string, passed: boolean, detail: string): GateResult => ({
  id,
  passed,
  detail: detail.slice(0, 500),
});

/** Tables that are never legitimately empty once the pipeline has run. */
const REQUIRED_TABLES = ['documents', 'case_events', 'entities', 'relationships'] as const;

/** The web loader refuses bundles above 64 MB compressed (B-41); keep headroom. */
export const MAX_BUNDLE_BYTES = 48 * 1024 * 1024;

export const seedCasesIn = (graph: GraphLabBundle): string[] =>
  [...new Set(graph.nodes.flatMap((n) => n.seed_cases))].sort();

export const GATES: readonly Gate[] = [
  {
    id: 'required_tables',
    check: ({ stats }) => {
      const empty = REQUIRED_TABLES.filter((t) => (stats.rows[t] ?? 0) === 0);
      return result(
        'required_tables',
        empty.length === 0,
        empty.length ? `empty: ${empty.join(', ')}` : 'all present',
      );
    },
  },
  {
    id: 'max_row_drop',
    check: ({ stats, previous, maxDrop }) => {
      if (!previous) return result('max_row_drop', true, 'first publish: no baseline');
      const drops = Object.entries(previous.rows)
        .filter(([t, before]) => before > 0 && (stats.rows[t] ?? 0) < before * (1 - maxDrop))
        .map(([t, before]) => `${t} ${before} → ${stats.rows[t] ?? 0}`);
      return result(
        'max_row_drop',
        drops.length === 0,
        drops.length ? `dropped > ${maxDrop * 100}%: ${drops.join('; ')}` : 'within limit',
      );
    },
  },
  {
    id: 'bundle_size',
    check: ({ bundleBytes }) =>
      result(
        'bundle_size',
        bundleBytes <= MAX_BUNDLE_BYTES,
        `${(bundleBytes / 1024 / 1024).toFixed(1)} MB of ${MAX_BUNDLE_BYTES / 1024 / 1024} MB`,
      ),
  },
  {
    id: 'newer_than_published',
    check: ({ stats, previous }) => {
      if (!previous) return result('newer_than_published', true, 'first publish');
      const newer = Date.parse(stats.built_at) > Date.parse(previous.built_at);
      return result(
        'newer_than_published',
        newer,
        `${stats.built_at} vs published ${previous.built_at}`,
      );
    },
  },
  {
    id: 'seed_cases_kept',
    check: ({ graph, previous }) => {
      if (!previous) return result('seed_cases_kept', true, 'first publish');
      const now = new Set(seedCasesIn(graph));
      const lost = previous.seed_cases.filter((c) => !now.has(c));
      return result(
        'seed_cases_kept',
        lost.length === 0,
        lost.length ? `missing: ${lost.join(', ')}` : `${now.size} seed cases present`,
      );
    },
  },
];

export function evaluateGates(input: GateInput, gates: readonly Gate[] = GATES): GateResult[] {
  return gates.map((g) => g.check(input));
}

export const allPassed = (results: readonly GateResult[]): boolean =>
  results.every((r) => r.passed);
