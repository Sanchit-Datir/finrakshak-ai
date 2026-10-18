import path from 'node:path';
import type { Address, DocumentRecord, Relationship } from '@finrakshak-ai/shared';
import { log } from '../log.js';
import type { EntityRegistry } from '../resolve/entityRegistry.js';
import { loadMcaMaster, type McaCompany } from '../sources/mcaMaster.js';
import { stableId } from '../util/ids.js';

const MCA_DOC_ID = 'doc_mca_company_master';
const MCA_URL =
  'https://www.data.gov.in/resource/registrars-companies-roc-wise-company-master-data';

export interface McaEnrichment {
  readonly document: DocumentRecord | null;
  readonly addresses: Address[];
  readonly edges: Relationship[];
  readonly stats: { files: number; rows: number; matched_by_cin: number; matched_by_name: number };
}

export function normalizeAddress(raw: string): string {
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\b(ROAD)\b/g, 'RD')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(
  key: string,
  cin: string | null,
  byCin: Map<string, McaCompany>,
  byName: Map<string, McaCompany[]>,
): { c: McaCompany; via: 'cin' | 'name' } | null {
  if (cin) {
    const c = byCin.get(cin);
    return c ? { c, via: 'cin' } : null;
  }
  const candidates = byName.get(key) ?? [];
  const only = candidates.length === 1 ? candidates[0] : undefined; // ambiguous names are not merged (B-37)
  return only ? { c: only, via: 'name' } : null;
}

function mcaDocument(files: readonly string[]): DocumentRecord {
  return {
    document_id: MCA_DOC_ID,
    source_id: 'mca_ogd',
    collection: 'mca_ogd.company_master',
    item_id: 'mca_ogd_company_master',
    url: MCA_URL,
    title: `MCA RoC-wise company master data (${files.map((f) => path.basename(f)).join(', ')})`,
    publication_date: null,
    retrieval_date: null,
    checksum_sha256: null,
    file_location: files.map((f) => `gs://<bucket>/raw/mca_ogd/${path.basename(f)}`).join(' '),
    content_type: 'text/csv',
    text_chars: 0,
    page_count: 0,
    terms_note:
      'Government Open Data Licence – India: reuse with attribution to MCA / data.gov.in.',
  };
}

/** Enriches resolved organisations with MCA master data and registered-address edges. */
export async function enrichFromMca(reg: EntityRegistry): Promise<McaEnrichment> {
  const keys = reg.orgKeys();
  const cins = new Set(keys.map((k) => reg.documentCin(k)).filter((c): c is string => c !== null));
  const index = await loadMcaMaster(new Set(keys), cins);
  const empty = { document: null, addresses: [], edges: [] };
  if (index.files.length === 0) {
    log.info('MCA master data not present; skipping enrichment', {
      expected: 'data/raw/mca_ogd/*.csv',
    });
    return { ...empty, stats: { files: 0, rows: 0, matched_by_cin: 0, matched_by_name: 0 } };
  }
  const matches: { key: string; c: McaCompany; via: 'cin' | 'name' }[] = [];
  for (const key of keys) {
    const m = pick(key, reg.documentCin(key), index.byCin, index.byName);
    if (!m) continue;
    reg.enrich(key, m.c.cin, {
      status: m.c.status,
      incorporation_date: m.c.incorporation_date,
      address: m.c.address,
      state: m.c.state,
      via: m.via,
    });
    matches.push({ key, ...m });
  }
  const { addresses, edges } = addressGraph(reg, matches);
  return {
    document: mcaDocument(index.files),
    addresses,
    edges,
    stats: {
      files: index.files.length,
      rows: index.rows,
      matched_by_cin: matches.filter((m) => m.via === 'cin').length,
      matched_by_name: matches.filter((m) => m.via === 'name').length,
    },
  };
}

function addressGraph(
  reg: EntityRegistry,
  matches: readonly { key: string; c: McaCompany; via: 'cin' | 'name' }[],
): { addresses: Address[]; edges: Relationship[] } {
  const byAddress = new Map<string, { raw: string; state: string | null; entities: Set<string> }>();
  const edges = new Map<string, Relationship>();
  for (const { key, c, via } of matches) {
    if (!c.address) continue;
    const norm = normalizeAddress(c.address);
    if (norm.length < 10) continue;
    const addressId = stableId('adr', norm);
    const entityId = reg.entityId(key);
    const acc = byAddress.get(addressId) ?? {
      raw: c.address,
      state: c.state,
      entities: new Set<string>(),
    };
    acc.entities.add(entityId);
    byAddress.set(addressId, acc);
    const relationshipId = stableId('rel', entityId, 'REGISTERED_AT', addressId);
    edges.set(relationshipId, {
      relationship_id: relationshipId,
      from_id: entityId,
      relationship_type: 'REGISTERED_AT',
      to_id: addressId,
      valid_from: null,
      valid_to: null,
      first_observed_at: null,
      source_id: 'mca_ogd',
      document_id: MCA_DOC_ID,
      evidence_status: 'fact',
      confidence: via === 'cin' ? 0.95 : 0.8,
    });
  }
  const addresses = [...byAddress].map(([address_id, a]) => ({
    address_id,
    normalized_address: normalizeAddress(a.raw),
    raw_address: a.raw,
    state: a.state,
    normalization_confidence: 0.8,
    entity_count: a.entities.size,
  }));
  return { addresses, edges: [...edges.values()] };
}
