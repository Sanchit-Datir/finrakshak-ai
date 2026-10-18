import { SeedVerificationFileSchema, entryKey } from '@finrakshak-ai/shared';
import { dataKey } from '../config.js';
import { readJson } from '../store/jsonl.js';
import { mineCandidates } from './candidates.js';
import { loadPopulation } from './population.js';
import { seedCases } from './seedTimelines.js';
import type { MinerSettings } from './settings.js';
import { readTimelines } from './timelines.js';
import type { MinerContext } from './tools.js';

export const SEED_REVIEW_KEY = dataKey('verification', 'seed_review.json');

/**
 * Everything the miner's agent reads, built by code from the processed public tables and the owner's
 * seed review: the candidates with their numbers, the seed timelines, and the entry titles (untrusted
 * public text, only ever passed to the model under `untrusted_data`).
 */
export async function loadMinerContext(settings: MinerSettings): Promise<MinerContext> {
  const [timelines, review, population] = await Promise.all([
    readTimelines(),
    readJson(SEED_REVIEW_KEY, SeedVerificationFileSchema),
    loadPopulation(settings),
  ]);
  const seeds = seedCases(
    timelines,
    review,
    population.statusByDocument,
    population.asOf,
    settings,
  );
  const titles = new Map<string, string>();
  for (const t of timelines) for (const e of t.entries) titles.set(entryKey(e), e.title);
  return {
    result: mineCandidates(seeds, population.timelines, settings),
    seeds: new Map(seeds.map((s) => [s.case_id, s])),
    titles,
  };
}
