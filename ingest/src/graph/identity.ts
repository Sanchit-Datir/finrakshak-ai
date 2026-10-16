import type {
  Entity,
  EntityMatchCandidate,
  GraphEdge,
  IdentityCandidate,
} from '@fund-tracker/shared';
import { nameSimilarity, normalizeCompanyName } from '../resolve/names.js';
import { stableId } from '../util/ids.js';

/** Below this name similarity, co-located entities are not proposed as possibly the same. */
export const ADDRESS_NAME_SIMILARITY = 0.5;

interface Pair {
  a: string;
  b: string;
  name_a: string;
  name_b: string;
  similarity: number;
  reasons: Set<string>;
}

function key(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Same-address pairs with similar names, skipping hub (service) addresses. */
function coLocated(
  registeredAt: readonly GraphEdge[],
  hubAddresses: ReadonlySet<string>,
): (readonly [string, string])[] {
  const atAddress = new Map<string, string[]>();
  for (const e of registeredAt)
    if (!hubAddresses.has(e.to)) atAddress.set(e.to, [...(atAddress.get(e.to) ?? []), e.from]);
  const out: (readonly [string, string])[] = [];
  for (const ids of atAddress.values())
    ids.forEach((a, i) => {
      for (const b of ids.slice(i + 1)) out.push([a, b]);
    });
  return out;
}

/**
 * Possible identity matches for manual review — never merged. Sources: the build's
 * similar-name candidates, plus similar names registered at the same (non-hub) address.
 * Two different CINs are two legal entities (B-37), so such pairs are never proposed;
 * group companies show up through their shared address instead.
 */
export function identityCandidates(
  entities: readonly Entity[],
  similar: readonly EntityMatchCandidate[],
  registeredAt: readonly GraphEdge[],
  hubAddresses: ReadonlySet<string>,
): IdentityCandidate[] {
  const pairs = new Map<string, Pair>();
  const cin = new Map(entities.map((e) => [e.entity_id, e.cin]));
  const distinctCins = (a: string, b: string): boolean => {
    const [ca, cb] = [cin.get(a) ?? null, cin.get(b) ?? null];
    return ca !== null && cb !== null && ca !== cb;
  };
  const add = (a: string, b: string, na: string, nb: string, sim: number, reason: string): void => {
    if (distinctCins(a, b)) return;
    const k = key(a, b);
    const p = pairs.get(k) ?? {
      a,
      b,
      name_a: na,
      name_b: nb,
      similarity: sim,
      reasons: new Set<string>(),
    };
    p.similarity = Math.max(p.similarity, sim);
    p.reasons.add(reason);
    pairs.set(k, p);
  };
  for (const c of similar)
    add(c.entity_a, c.entity_b, c.name_a, c.name_b, c.similarity, 'similar_name');
  const names = new Map(entities.map((e) => [e.entity_id, e.canonical_name]));
  for (const [a, b] of coLocated(registeredAt, hubAddresses)) {
    const [na, nb] = [names.get(a) ?? a, names.get(b) ?? b];
    const sim = nameSimilarity(normalizeCompanyName(na), normalizeCompanyName(nb));
    if (sim >= ADDRESS_NAME_SIMILARITY) add(a, b, na, nb, sim, 'same_registered_address');
  }
  return [...pairs.values()].map((p) => ({
    id: stableId('idc', key(p.a, p.b)),
    a: p.a,
    b: p.b,
    name_a: p.name_a,
    name_b: p.name_b,
    similarity: Math.round(p.similarity * 100) / 100,
    reasons: [...p.reasons].sort(),
    status: 'needs_review' as const,
  }));
}
