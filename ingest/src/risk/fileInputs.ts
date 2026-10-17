import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SeedVerificationFileSchema,
  SynthEntitySchema,
  SynthFlagSchema,
  SynthLoanSchema,
  SynthManifestSchema,
  SynthRelationshipSchema,
  SynthTransactionSchema,
  type PublicRecord,
  type SynthEntity,
  type SynthFlag,
} from '@fund-tracker/shared';
import type { z } from 'zod';
import { normalizeCompanyName } from '../resolve/names.js';
import type { ScoringData, ScoringInputPort } from './inputs.js';

/**
 * File implementation of the input port, over the synthetic data in `data/synthetic/` (B-54). It reads
 * entities, relationships, loans, transactions, flags and the manifest, never `truth.jsonl` (B-55), plus
 * the owner's seed review. Every line is parsed with zod; a bad line stops the load with its file and
 * line number.
 */

export const INPUT_FILES = [
  'entities.jsonl',
  'relationships.jsonl',
  'loans.jsonl',
  'transactions.jsonl',
  'flags.jsonl',
  'manifest.json',
] as const;

export class ScoringInputError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = 'ScoringInputError';
  }
}

function readJsonl<T>(file: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out: T[] = [];
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (e: unknown) {
      throw new ScoringInputError(`${path.basename(file)} line ${i + 1} is not JSON`, { cause: e });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new ScoringInputError(
        `${path.basename(file)} line ${i + 1}: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    out.push(parsed.data);
  });
  return out;
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/**
 * Matches each flag to an entity by exact CIN, then exact normalised name (B-37). A name shared by
 * several entities is ambiguous and matches nothing. Customers and suppliers match too, so a record on a
 * borrower's customer reaches the graph layer.
 */
/** Entities a public record can name: not accounts, loans, documents or proceedings. */
const MATCHABLE_KINDS: readonly SynthEntity['kind'][] = ['company', 'individual', 'counterparty'];

export function matchRecords(
  flags: readonly SynthFlag[],
  entities: readonly SynthEntity[],
): { records: PublicRecord[]; unmatched: number } {
  const byName = new Map<string, string[]>();
  for (const e of entities) {
    if (!MATCHABLE_KINDS.includes(e.kind)) continue;
    const key = normalizeCompanyName(e.name);
    byName.set(key, [...(byName.get(key) ?? []), e.id]);
  }
  const records: PublicRecord[] = [];
  let unmatched = 0;
  for (const f of flags) {
    const ids = byName.get(normalizeCompanyName(f.entity.canonical_name)) ?? [];
    const [only] = ids;
    if (ids.length !== 1 || only === undefined) {
      unmatched++;
      continue;
    }
    records.push({
      record_id: f.event.event_id,
      entity_id: only,
      date: f.event_date,
      case_type: f.event.case_type,
      source_id: f.event.source_id,
      evidence_status: f.evidence_status,
    });
  }
  return { records, unmatched };
}

export interface FileInputOptions {
  /** Folder with the synthetic files. */
  readonly dir: string;
  /** The owner's review (`data/verification/seed_review.json`); a missing file is not an error. */
  readonly seedReviewFile: string;
}

function loadSeedReview(file: string): ScoringData['seedReview'] {
  if (!existsSync(file)) return null;
  const parsed = SeedVerificationFileSchema.safeParse(readJson(file));
  if (!parsed.success)
    throw new ScoringInputError(`${path.basename(file)} is not a seed review file`);
  return parsed.data;
}

function load(opts: FileInputOptions): ScoringData {
  const at = (name: string): string => path.join(opts.dir, name);
  for (const required of ['loans.jsonl', 'transactions.jsonl', 'entities.jsonl'])
    if (!existsSync(at(required)))
      throw new ScoringInputError(`${required} is missing in ${opts.dir}; run npm run synth`);
  const missing: string[] = [];
  const optional = <T>(name: string, read: () => T[]): T[] => {
    if (existsSync(at(name))) return read();
    missing.push(name.replace(/\.jsonl$/, ''));
    return [];
  };
  const entities = readJsonl(at('entities.jsonl'), SynthEntitySchema);
  const links = optional('relationships.jsonl', () =>
    readJsonl(at('relationships.jsonl'), SynthRelationshipSchema),
  );
  const flags = optional('flags.jsonl', () => readJsonl(at('flags.jsonl'), SynthFlagSchema));
  const manifest = existsSync(at('manifest.json'))
    ? SynthManifestSchema.safeParse(readJson(at('manifest.json')))
    : null;
  const { records, unmatched } = matchRecords(flags, entities);
  return {
    loans: readJsonl(at('loans.jsonl'), SynthLoanSchema),
    transactions: readJsonl(at('transactions.jsonl'), SynthTransactionSchema),
    entities,
    links,
    records,
    seedReview: loadSeedReview(opts.seedReviewFile),
    dataBuiltOn: null,
    period:
      manifest?.success === true
        ? { startMonth: manifest.data.as_of_start.slice(0, 7), months: manifest.data.months }
        : null,
    missingInputs: missing,
    unmatchedRecords: unmatched,
  };
}

export const fileScoringInputs = (opts: FileInputOptions): ScoringInputPort => ({
  load: () => Promise.resolve().then(() => load(opts)),
});
