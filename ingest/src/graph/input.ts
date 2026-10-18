import {
  AddressSchema,
  CaseEventSchema,
  DocumentRecordSchema,
  EntityMatchCandidateSchema,
  EntitySchema,
  PersonSchema,
  RelationshipSchema,
  type Address,
  type CaseEvent,
  type DocumentRecord,
  type Entity,
  type EntityMatchCandidate,
  type Person,
  type Relationship,
} from '@finrakshak-ai/shared';
import { z } from 'zod';
import { dataKey } from '../config.js';
import { readJson, readJsonl } from '../store/jsonl.js';

/** Everything the graph builder needs; real data comes from data/processed (read-only). */
export interface GraphInput {
  readonly entities: readonly Entity[];
  readonly persons: readonly Person[];
  readonly addresses: readonly Address[];
  readonly relationships: readonly Relationship[];
  readonly events: readonly CaseEvent[];
  readonly documents: readonly DocumentRecord[];
  readonly matchCandidates: readonly EntityMatchCandidate[];
  readonly datasetBuiltAt: string | null;
}

const StatsSchema = z.object({ built_at: z.string() });

async function builtAt(): Promise<string | null> {
  try {
    return (await readJson(dataKey('processed', 'stats.json'), StatsSchema))?.built_at ?? null;
  } catch (e) {
    throw new Error('Unreadable data/processed/stats.json', { cause: e });
  }
}

const table = (name: string): string => dataKey('processed', `${name}.jsonl`);

/** Loads the canonical tables built by `ingest build`. Never writes to data/processed. */
export async function loadProcessed(): Promise<GraphInput> {
  return {
    entities: await readJsonl(table('entities'), EntitySchema),
    persons: await readJsonl(table('persons'), PersonSchema),
    addresses: await readJsonl(table('addresses'), AddressSchema),
    relationships: await readJsonl(table('relationships'), RelationshipSchema),
    events: await readJsonl(table('case_events'), CaseEventSchema),
    documents: await readJsonl(table('documents'), DocumentRecordSchema),
    matchCandidates: await readJsonl(table('entity_match_candidates'), EntityMatchCandidateSchema),
    datasetBuiltAt: await builtAt(),
  };
}
