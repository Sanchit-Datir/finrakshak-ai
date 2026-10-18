import type { CaseSeed, ListingItem, SourceId } from '@finrakshak-ai/shared';
import { CASE_SEEDS } from '../seed/cases.js';

export interface SeedMatch {
  readonly case_id: string;
  readonly alias: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasRegExp(alias: string): RegExp {
  const acronym = alias === alias.toUpperCase() && !/\s/.test(alias);
  const body = escapeRe(alias).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, acronym ? '' : 'i');
}

interface CompiledSeed {
  readonly seed: CaseSeed;
  readonly patterns: readonly (readonly [string, RegExp])[];
}

const COMPILED: readonly CompiledSeed[] = CASE_SEEDS.map((seed) => ({
  seed,
  patterns: [...seed.aliases, ...seed.related_aliases].map((a) => [a, aliasRegExp(a)] as const),
}));

/** Every seed case whose alias appears in `text` (one match per case). */
export function matchSeeds(text: string): SeedMatch[] {
  const out: SeedMatch[] = [];
  for (const { seed, patterns } of COMPILED) {
    const hit = patterns.find(([, re]) => re.test(text));
    if (hit) out.push({ case_id: seed.case_id, alias: hit[0] });
  }
  return out;
}

/** Signals of lending fraud / fund diversion in a title or description. */
const FUND_DIVERSION =
  /divers|siphon|misutili[sz]|misappropriat|round[- ]?tripp|shell compan|fictitious|bogus|accommodation entr|related[- ]part|financial (statement|result)s?|books of accounts|forensic audit|GDR|end[- ]use|loan|bank fraud|consortium|defraud|cheat|wilful default|letters? of undertaking|LoUs?\b|credit facilit/i;

const RBI_ENFORCEMENT =
  /monetary penalty|cancels? (the )?certificate of registration|cancels? (the )?licen[cs]e|section 35A|supersed|alert list|wilful|fraud|moratorium|restrictions on/i;

/** Lower number = higher priority; null = do not download (metadata only). */
export function downloadPriority(sourceId: SourceId, item: ListingItem): number | null {
  const text = `${item.title} ${Object.values(item.fields).join(' ')}`;
  const seeded = matchSeeds(text).length > 0;
  switch (sourceId) {
    case 'nfra':
    case 'sfio':
      return 0;
    case 'ibbi':
      return seeded ? 0 : null;
    case 'ed':
      if (seeded) return 0;
      return FUND_DIVERSION.test(text) ? 1 : null;
    case 'sebi':
      // Every listed SEBI order is eligible; the per-source cap bounds volume.
      if (seeded) return 0;
      return FUND_DIVERSION.test(text) ? 1 : 2;
    case 'rbi':
      return RBI_ENFORCEMENT.test(item.title) ? (seeded ? 0 : 1) : null;
    case 'mca_ogd':
    case 'nse_bse':
    case 'nclt':
    case 'ecourts_sci':
      return null;
  }
}

/** Orders items for download: priority, then most recent first; caps at `max`. */
export function selectForDownload(
  sourceId: SourceId,
  items: readonly ListingItem[],
  max: number,
): ListingItem[] {
  return items
    .map((item) => ({ item, p: downloadPriority(sourceId, item) }))
    .filter((x): x is { item: ListingItem; p: number } => x.p !== null)
    .sort(
      (a, b) =>
        a.p - b.p || (b.item.published_date ?? '').localeCompare(a.item.published_date ?? ''),
    )
    .slice(0, max)
    .map((x) => x.item);
}
