import type { Entity, EntityType, Person, SourceId } from '@fund-tracker/shared';
import { stableId } from '../util/ids.js';
import {
  guessEntityType,
  nameSimilarity,
  normalizeCompanyName,
  normalizePersonName,
} from './names.js';

export interface OrgAttributes {
  readonly status: string | null;
  readonly incorporation_date: string | null;
  readonly address: string | null;
  readonly state: string | null;
  readonly via: 'cin' | 'name';
}

interface OrgAcc {
  readonly key: string;
  attrs?: OrgAttributes;
  readonly names: Map<string, number>;
  readonly sources: Set<SourceId>;
  readonly cins: Map<string, number>;
  type: EntityType | null;
  mentions: number;
}

interface PersonAcc {
  readonly key: string;
  readonly names: Set<string>;
  readonly roles: Set<string>;
  readonly sources: Set<SourceId>;
}

export interface MatchCandidate {
  readonly entity_a: string;
  readonly entity_b: string;
  readonly name_a: string;
  readonly name_b: string;
  readonly similarity: number;
  readonly reason: string;
}

/**
 * Resolves organisation mentions. Exact CIN and exact normalised name merge;
 * fuzzy similarity only produces review candidates (brief step 5: never merge
 * uncertain matches automatically).
 */
export class EntityRegistry {
  private readonly orgs = new Map<string, OrgAcc>();
  private readonly people = new Map<string, PersonAcc>();

  /** Records a mention and returns the provisional key (normalised name). */
  addOrg(name: string, source: SourceId, type?: EntityType): string | null {
    const key = normalizeCompanyName(name);
    if (key.length < 3) return null;
    const acc = this.orgs.get(key) ?? {
      key,
      names: new Map<string, number>(),
      sources: new Set(),
      cins: new Map<string, number>(),
      type: null,
      mentions: 0,
    };
    acc.names.set(name.trim(), (acc.names.get(name.trim()) ?? 0) + 1);
    acc.sources.add(source);
    acc.mentions++;
    if (type) acc.type = type;
    this.orgs.set(key, acc);
    return key;
  }

  orgKeys(): string[] {
    return [...this.orgs.keys()];
  }

  /** CIN bound from documents, if unambiguous. */
  documentCin(key: string): string | null {
    const acc = this.orgs.get(key);
    return acc ? this.cinOf(acc) : null;
  }

  /** Attaches MCA master attributes; a name match also binds the CIN. */
  enrich(key: string, cin: string, attrs: OrgAttributes): void {
    const acc = this.orgs.get(key);
    if (!acc) return;
    if (attrs.via === 'name') acc.cins.set(cin, (acc.cins.get(cin) ?? 0) + 1);
    acc.attrs = attrs;
  }

  attributes(key: string): OrgAttributes | undefined {
    return this.orgs.get(key)?.attrs;
  }

  bindCin(key: string, cin: string): void {
    const acc = this.orgs.get(key);
    if (acc) acc.cins.set(cin, (acc.cins.get(cin) ?? 0) + 1);
  }

  addPerson(name: string, role: string, source: SourceId): string | null {
    const key = normalizePersonName(name);
    if (key.length < 3 || !/\s/.test(key)) return null;
    const acc = this.people.get(key) ?? {
      key,
      names: new Set(),
      roles: new Set(),
      sources: new Set(),
    };
    acc.names.add(name.trim());
    acc.roles.add(role);
    acc.sources.add(source);
    this.people.set(key, acc);
    return stableId('per', key);
  }

  /** A CIN is accepted only when a name maps to exactly one CIN. */
  private cinOf(acc: OrgAcc): string | null {
    return acc.cins.size === 1 ? ([...acc.cins.keys()][0] ?? null) : null;
  }

  entityId(key: string): string {
    const acc = this.orgs.get(key);
    const cin = acc ? this.cinOf(acc) : null;
    return cin ? `ent_${cin}` : stableId('ent', key);
  }

  entities(): Entity[] {
    const byId = new Map<string, Entity>();
    for (const acc of this.orgs.values()) {
      const id = this.entityId(acc.key);
      const prev = byId.get(id);
      const names = [...acc.names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
      const cin = this.cinOf(acc);
      byId.set(id, {
        entity_id: id,
        entity_type: acc.type ?? guessEntityType(acc.key),
        canonical_name: prev?.canonical_name ?? names[0] ?? acc.key,
        cin,
        status: acc.attrs?.status ?? prev?.status ?? null,
        incorporation_date: acc.attrs?.incorporation_date ?? prev?.incorporation_date ?? null,
        jurisdiction: 'IN',
        aliases: [...new Set([...(prev?.aliases ?? []), acc.key, ...names])].slice(0, 25),
        match_method: !cin
          ? 'normalized_name'
          : acc.attrs?.via === 'name'
            ? 'mca_master_name'
            : 'exact_cin',
        sources: [...new Set([...(prev?.sources ?? []), ...acc.sources])],
        mention_count: (prev?.mention_count ?? 0) + acc.mentions,
      });
    }
    return [...byId.values()];
  }

  persons(): Person[] {
    return [...this.people.values()].map((p) => ({
      person_id: stableId('per', p.key),
      name: p.key,
      name_variants: [...p.names].slice(0, 10),
      roles: [...p.roles],
      sources: [...p.sources],
    }));
  }

  /** Similar-but-not-identical names, blocked by first token, for human review. */
  matchCandidates(threshold = 0.75, maxBlock = 400): MatchCandidate[] {
    const blocks = new Map<string, string[]>();
    for (const key of this.orgs.keys()) {
      const first = key.split(' ')[0] ?? '';
      blocks.set(first, [...(blocks.get(first) ?? []), key]);
    }
    const out: MatchCandidate[] = [];
    for (const keys of blocks.values()) {
      if (keys.length < 2 || keys.length > maxBlock) continue;
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) this.compare(keys[i], keys[j], threshold, out);
      }
    }
    return out;
  }

  private compare(
    a: string | undefined,
    b: string | undefined,
    threshold: number,
    out: MatchCandidate[],
  ): void {
    if (!a || !b) return;
    const ida = this.entityId(a);
    const idb = this.entityId(b);
    if (ida === idb) return;
    const similarity = nameSimilarity(a, b);
    if (similarity < threshold) return;
    out.push({
      entity_a: ida,
      entity_b: idb,
      name_a: a,
      name_b: b,
      similarity,
      reason: 'token_jaccard_same_first_token',
    });
  }
}
