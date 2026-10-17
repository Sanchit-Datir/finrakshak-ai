import {
  SYNTH_ARCHETYPES,
  SynthEntitySchema,
  SynthLoanSchema,
  SynthRelationshipSchema,
  type SynthArchetype,
  type SynthEntity,
  type SynthFlag,
  type SynthLoan,
  type SynthRelationship,
  type SynthTransaction,
  type SynthTruth,
} from '@fund-tracker/shared';
import { ARCHETYPES } from './archetypes/index.js';
import type { BuiltLoan, LoanContext } from './archetypes/types.js';
import { BANK_ACCOUNT_ID, bankEntities, makeHorizon } from './base.js';
import { LedgerBuilder, compareTxn } from './ledger.js';
import { NameBook } from './names.js';
import { createRng } from './rng.js';

export const GENERATOR_VERSION = '1';
export const MIN_MONTHS = 12;
export const MAX_MONTHS = 36;

export interface GenerateOptions {
  readonly seed: number;
  /** First IST month covered, `YYYY-MM`. */
  readonly startMonth?: string;
  readonly months?: number;
  /** Customers per scenario. Scenarios that are not built yet are skipped and reported. */
  readonly allocation: Partial<Readonly<Record<SynthArchetype, number>>>;
}

export interface SynthDataset {
  readonly seed: number;
  readonly startMonth: string;
  readonly months: number;
  readonly entities: SynthEntity[];
  readonly relationships: SynthRelationship[];
  readonly loans: SynthLoan[];
  readonly transactions: SynthTransaction[];
  readonly flags: SynthFlag[];
  readonly truth: SynthTruth[];
  /** Scenarios that were asked for but have no builder yet. */
  readonly notBuilt: SynthArchetype[];
}

const byId =
  <T>(key: (t: T) => string) =>
  (a: T, b: T): number => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };

function assertUnique(label: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id ${id}`);
    seen.add(id);
  }
}

/** One loan's transactions as a checked ledger: the borrower's account starts empty and never goes below zero. */
function settle(built: BuiltLoan): SynthTransaction[] {
  const ledger = new LedgerBuilder(new Map([[built.loan.accountEntityId, 0]]));
  for (const t of built.transactions) ledger.add(t);
  return ledger.build();
}

/**
 * Builds the whole dataset for a seed. The same options always give the same result (B-24). Every loan
 * has its own random stream named by its scenario and number, so changing one scenario's count never
 * changes how another scenario's loans look.
 */
export function generate(options: GenerateOptions): SynthDataset {
  const months = options.months ?? 24;
  if (!Number.isInteger(months) || months < MIN_MONTHS || months > MAX_MONTHS)
    throw new RangeError(`months must be between ${MIN_MONTHS} and ${MAX_MONTHS}`);
  const horizon = makeHorizon(options.startMonth ?? '2024-01', months);
  const root = createRng(options.seed);
  const names = new NameBook(root.fork('names'));
  const built: BuiltLoan[] = [];
  const notBuilt: SynthArchetype[] = [];
  let n = 0;
  for (const id of SYNTH_ARCHETYPES) {
    const count = options.allocation[id] ?? 0;
    const archetype = ARCHETYPES[id];
    if (count > 0 && archetype === undefined) notBuilt.push(id);
    if (archetype === undefined) continue;
    for (let i = 0; i < count; i++) {
      n++;
      const ctx: LoanContext = { n, rng: root.fork(`${id}/${n}`), names, horizon };
      built.push(archetype.build(ctx));
    }
  }
  const dataset = {
    seed: options.seed,
    startMonth: horizon.startMonth,
    months,
    entities: [...bankEntities(), ...built.flatMap((b) => b.entities)]
      .map((e) => SynthEntitySchema.parse(e))
      .sort(byId((e) => e.id)),
    relationships: built
      .flatMap((b) => b.relationships)
      .map((r) => SynthRelationshipSchema.parse(r))
      .sort(byId((r) => r.id)),
    loans: built.map((b) => SynthLoanSchema.parse(b.loan)).sort(byId((l) => l.id)),
    transactions: built.flatMap(settle).sort(compareTxn),
    flags: built.flatMap((b) => b.flags).sort(byId((f) => f.flag_id)),
    truth: built.map((b) => b.truth).sort(byId((t) => t.loan_id)),
    notBuilt,
  };
  assertUnique(
    'entity',
    dataset.entities.map((e) => e.id),
  );
  assertUnique(
    'transaction',
    dataset.transactions.map((t) => t.id),
  );
  assertUnique(
    'loan',
    dataset.loans.map((l) => l.id),
  );
  assertUnique(
    'relationship',
    dataset.relationships.map((r) => r.id),
  );
  assertUnique(
    'flag',
    dataset.flags.map((f) => f.flag_id),
  );
  return dataset;
}

export { BANK_ACCOUNT_ID };
