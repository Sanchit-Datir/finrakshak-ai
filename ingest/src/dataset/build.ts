import {
  AddressSchema,
  CaseDocumentLinkSchema,
  CaseEventSchema,
  CaseSeedSchema,
  DocumentRecordSchema,
  EntityMatchCandidateSchema,
  EntitySchema,
  EvidenceClaimSchema,
  ListingItemSchema,
  PersonSchema,
  RelationshipSchema,
  RiskSignalSchema,
  type Entity,
  type ListingItem,
} from '@finrakshak-ai/shared';
import { z } from 'zod';
import { listingKey } from '../acquire.js';
import { dataKey } from '../config.js';
import { documentArtifacts } from '../extract/documentArtifacts.js';
import { readText } from '../extract/runExtract.js';
import { log } from '../log.js';
import { CASE_SEEDS } from '../seed/cases.js';
import { downloadPriority, matchSeeds } from '../select/relevance.js';
import type { SourceAdapter } from '../sources/types.js';
import { readJsonl, writeJson, writeJsonl } from '../store/jsonl.js';
import { RawStore } from '../store/rawStore.js';
import { bigQuerySchema, type BqField } from './bigquery.js';
import { classify } from './classify.js';
import { enrichFromMca } from './mca.js';
import { DatasetCollector, type DocWithText } from './collector.js';
import { buildClaims, buildRelationships } from './finalize.js';
import { buildSignals } from './signals.js';
import { buildTimelines } from './timelines.js';

/** Non-enforcement RBI releases (auctions, statistics) are not case events. */
function include(item: ListingItem): boolean {
  return item.source_id !== 'rbi' || downloadPriority('rbi', item) !== null;
}

async function collectSource(
  c: DatasetCollector,
  adapter: SourceAdapter,
  adverse: Set<string>,
): Promise<number> {
  const items = (await readJsonl(listingKey(adapter.id), ListingItemSchema)).filter(include);
  const store = await RawStore.open(adapter.id);
  const docsByItem = new Map<string, DocWithText[]>();
  for (const { item, url, artifact } of await documentArtifacts(adapter.id, store)) {
    const docs = docsByItem.get(item.item_id) ?? [];
    docs.push({ url, artifact, text: await readText(artifact.sha256) });
    docsByItem.set(item.item_id, docs);
  }
  for (const item of items) {
    const cls = classify(item);
    if (cls.adverse) adverse.add(cls.case_type);
    c.addItem(item, docsByItem.get(item.item_id) ?? [], cls, adapter.termsNote);
  }
  log.info('collected', {
    source: adapter.id,
    items: items.length,
    with_documents: docsByItem.size,
  });
  return items.length;
}

function seedEntityIds(entities: readonly Entity[]): Set<string> {
  return new Set(
    entities
      .filter((e) => matchSeeds([e.canonical_name, ...e.aliases].join(' | ')).length > 0)
      .map((e) => e.entity_id),
  );
}

const TABLES = {
  documents: DocumentRecordSchema,
  case_events: CaseEventSchema,
  entities: EntitySchema,
  persons: PersonSchema,
  relationships: RelationshipSchema,
  evidence_claims: EvidenceClaimSchema,
  risk_signals: RiskSignalSchema,
  case_seeds: CaseSeedSchema,
  case_documents: CaseDocumentLinkSchema,
  entity_match_candidates: EntityMatchCandidateSchema,
  addresses: AddressSchema,
} as const satisfies Record<string, z.AnyZodObject>;
export type TableName = keyof typeof TABLES;

/** Every canonical table, in load order (BigQuery, publish gates). */
export const TABLE_NAMES = Object.keys(TABLES) as readonly TableName[];

export const tableKey = (name: TableName): string => dataKey('processed', `${name}.jsonl`);
export const tableBigQuerySchema = (name: TableName): BqField[] => bigQuerySchema(TABLES[name]);
export const tableSchemaKey = (name: TableName): string =>
  dataKey('processed', 'bigquery', `${name}.schema.json`);

async function writeTable(name: TableName, rows: readonly unknown[]): Promise<number> {
  const schema = TABLES[name];
  const valid = rows.map((r, i) => {
    const parsed = schema.safeParse(r);
    if (!parsed.success) throw new Error(`Invalid ${name} row ${i}: ${parsed.error.message}`);
    return parsed.data;
  });
  await writeJsonl(tableKey(name), valid);
  await writeJson(tableSchemaKey(name), bigQuerySchema(schema));
  return valid.length;
}

export const DatasetStatsSchema = z.object({
  built_at: z.string().datetime(),
  listed_items: z.record(z.string(), z.number().int().nonnegative()),
  mca_master: z.unknown(),
  rows: z.record(z.string(), z.number().int().nonnegative()),
});
export type DatasetStats = z.infer<typeof DatasetStatsSchema>;

export const statsKey = (): string => dataKey('processed', 'stats.json');

/** Builds every canonical table (brief section 8) from listings, documents and text. */
export async function buildDataset(adapters: readonly SourceAdapter[]): Promise<DatasetStats> {
  const c = new DatasetCollector();
  const adverse = new Set<string>();
  const listed: Record<string, number> = {};
  for (const a of adapters) listed[a.id] = await collectSource(c, a, adverse);
  // MCA enrichment binds CINs, so it must run before any entity id is materialised.
  const mca = await enrichFromMca(c.registry);
  const relationships = [...buildRelationships(c), ...mca.edges];
  const entities = c.registry.entities();
  const signals = buildSignals(relationships, c.events, adverse, seedEntityIds(entities));
  const documents = mca.document ? [...c.documents, mca.document] : c.documents;
  const counts: Record<string, number> = {
    documents: await writeTable('documents', documents),
    case_events: await writeTable('case_events', c.events),
    entities: await writeTable('entities', entities),
    persons: await writeTable('persons', c.registry.persons()),
    relationships: await writeTable('relationships', relationships),
    evidence_claims: await writeTable('evidence_claims', buildClaims(c)),
    risk_signals: await writeTable('risk_signals', signals),
    case_seeds: await writeTable('case_seeds', CASE_SEEDS),
    case_documents: await writeTable('case_documents', c.caseLinks),
    entity_match_candidates: await writeTable(
      'entity_match_candidates',
      c.registry.matchCandidates(),
    ),
    addresses: await writeTable('addresses', mca.addresses),
  };
  await writeJson(
    dataKey('processed', 'case_timelines.json'),
    buildTimelines(c.caseLinks, c.events, c.documents),
  );
  const stats: DatasetStats = {
    built_at: new Date().toISOString(),
    listed_items: listed,
    mca_master: mca.stats,
    rows: counts,
  };
  await writeJson(statsKey(), stats);
  log.info('dataset built', counts);
  return stats;
}
