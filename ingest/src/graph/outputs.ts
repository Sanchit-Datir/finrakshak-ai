import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildAdjacency, neighbourhood, type GraphLabBundle } from '@finrakshak-ai/shared';
import { CASE_SEEDS } from '../seed/cases.js';
import { blobs, joinKey } from '../storage/index.js';
import { writeJson, writeJsonl } from '../store/jsonl.js';
import { subBundle } from './bundle.js';
import { computeInsights } from './insights.js';
import { renderReport } from './report.js';

export interface BundleIndexEntry {
  readonly file: string;
  readonly label: string;
  readonly synthetic: boolean;
}

const SEED_HOPS = 2;
const SEED_CAP = 400;
const TOP_NETWORKS = 10;

async function writeGz(key: string, value: unknown): Promise<void> {
  const body = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
  await blobs().write(key, body, { contentType: 'application/gzip' });
}

async function writeText(key: string, text: string): Promise<void> {
  await blobs().write(key, text, { contentType: 'text/markdown; charset=utf-8' });
}

/** Small, self-contained bundles that can be loaded in the viewer or used as app test data. */
function testBundles(full: GraphLabBundle): { name: string; bundle: GraphLabBundle }[] {
  const adj = buildAdjacency(full.edges, { includeWeak: true });
  const hub = new Set(full.nodes.filter((n) => n.hub).map((n) => n.id));
  const out: { name: string; bundle: GraphLabBundle }[] = [];
  for (const seed of CASE_SEEDS) {
    const roots = full.nodes.filter((n) => n.seed_cases.includes(seed.case_id)).map((n) => n.id);
    if (roots.length === 0) continue;
    const ids = neighbourhood(adj, roots, SEED_HOPS, SEED_CAP, (id) => hub.has(id));
    out.push({
      name: `seed-${seed.case_id}`,
      bundle: subBundle(full, new Set(ids.keys()), `Seed case: ${seed.display_name} (2 hops)`),
    });
  }
  const top = new Set(full.networks.slice(0, TOP_NETWORKS).flatMap((n) => n.node_ids));
  out.push({ name: 'top-networks', bundle: subBundle(full, top, `Top ${TOP_NETWORKS} networks`) });
  return out;
}

/** Writes everything under the `dir` key prefix (`graph`); nothing outside it is modified. */
export async function writeGraphOutputs(
  dir: string,
  full: GraphLabBundle,
  scenarios: GraphLabBundle,
): Promise<BundleIndexEntry[]> {
  const insights = computeInsights(full);
  await writeGz(joinKey(dir, 'graph-lab.json.gz'), full);
  await writeJsonl(joinKey(dir, 'networks.jsonl'), full.networks);
  await writeJsonl(joinKey(dir, 'identity_candidates.jsonl'), full.identity);
  await writeJson(joinKey(dir, 'summary.json'), { meta: full.meta, insights });
  await writeText(joinKey(dir, 'REPORT.md'), renderReport(full, insights));
  await writeJson(joinKey(dir, 'test-scenarios', 'synthetic-scenarios.json'), scenarios);
  await writeText(
    joinKey(dir, 'test-scenarios', 'REPORT.md'),
    renderReport(scenarios, computeInsights(scenarios)),
  );
  const index: BundleIndexEntry[] = [
    { file: 'graph-lab.json.gz', label: full.meta.label, synthetic: false },
    {
      file: 'test-scenarios/synthetic-scenarios.json',
      label: scenarios.meta.label,
      synthetic: true,
    },
  ];
  for (const { name, bundle } of testBundles(full)) {
    await writeJson(joinKey(dir, 'test-data', `${name}.json`), bundle);
    index.push({ file: `test-data/${name}.json`, label: bundle.meta.label, synthetic: false });
  }
  await writeJson(joinKey(dir, 'index.json'), index);
  return index;
}

/** Copies the bundles into web/public/graph-lab (git-ignored) for the local viewer. */
export async function publishToWeb(
  dir: string,
  webDir: string,
  index: readonly BundleIndexEntry[],
): Promise<void> {
  for (const entry of [...index, { file: 'index.json' }]) {
    const blob = await blobs().read(joinKey(dir, entry.file));
    if (!blob) throw new Error(`Missing graph output ${entry.file}`);
    const target = path.join(webDir, ...entry.file.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, blob.data);
  }
}
