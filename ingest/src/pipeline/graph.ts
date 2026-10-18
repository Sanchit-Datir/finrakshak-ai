import type { GraphLabBundle } from '@finrakshak-ai/shared';
import { dataKey } from '../config.js';
import { buildGraph } from '../graph/bundle.js';
import { loadProcessed } from '../graph/input.js';
import { writeGraphOutputs, type BundleIndexEntry } from '../graph/outputs.js';
import { scenarioInput, scenarioNotes } from '../graph/scenarios.js';
import { log } from '../log.js';

export const GRAPH_PREFIX = dataKey('graph');

export interface GraphOutputs {
  /** Key prefix the bundles were written under (`graph`). */
  readonly prefix: string;
  readonly index: readonly BundleIndexEntry[];
  readonly full: GraphLabBundle;
}

/** Builds the real graph and the SYNTHETIC scenario bundle from data/processed and writes them. */
export async function buildGraphOutputs(): Promise<GraphOutputs> {
  const input = await loadProcessed();
  if (input.entities.length === 0)
    throw new Error('data/processed is empty — run `ingest build` first');
  const full = buildGraph(input, { synthetic: false, label: 'Public-source graph (real data)' });
  const scenarioBundle = buildGraph(scenarioInput(), {
    synthetic: true,
    label: 'SYNTHETIC test scenarios',
  });
  const scenarios = {
    ...scenarioBundle,
    meta: { ...scenarioBundle.meta, notes: [...scenarioBundle.meta.notes, ...scenarioNotes()] },
  };
  const index = await writeGraphOutputs(GRAPH_PREFIX, full, scenarios);
  log.info('graph written', { prefix: GRAPH_PREFIX, ...full.meta.counts });
  return { prefix: GRAPH_PREFIX, index, full };
}
