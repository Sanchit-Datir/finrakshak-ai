import type {
  SynthArchetype,
  SynthEntity,
  SynthFlag,
  SynthLoan,
  SynthRelationship,
  SynthTruth,
} from '@finrakshak-ai/shared';
import type { TxnFields } from '../ledger.js';
import type { NameBook } from '../names.js';
import type { Rng } from '../rng.js';

/** The period covered, as IST months and the last day of the last one. */
export interface Horizon {
  readonly startMonth: string;
  readonly months: number;
  readonly endMonth: string;
  readonly endDate: string;
}

/** What a scenario gets to build one loan: its number, its own random stream and the shared name pool. */
export interface LoanContext {
  readonly n: number;
  readonly rng: Rng;
  readonly names: NameBook;
  readonly horizon: Horizon;
}

/** Everything one scenario produces for one loan. Transactions are checked together as a ledger later. */
export interface BuiltLoan {
  readonly entities: SynthEntity[];
  readonly relationships: SynthRelationship[];
  readonly loan: SynthLoan;
  /** Number of monthly EMIs the loan was written for (not part of the app's loan shape). */
  readonly tenor: number;
  readonly transactions: TxnFields[];
  readonly flags: SynthFlag[];
  readonly truth: SynthTruth;
}

export interface Archetype {
  readonly id: SynthArchetype;
  build(ctx: LoanContext): BuiltLoan;
}

/**
 * A scenario whose loans belong together (a cluster of borrowers at one address). Loans are built in
 * groups of up to `groupSize`; a group always has at least two loans.
 */
export interface GroupArchetype {
  readonly id: SynthArchetype;
  readonly groupSize: number;
  /** `rng` is the group's own stream; each context has its own loan stream. */
  buildGroup(contexts: readonly LoanContext[], rng: Rng): BuiltLoan[];
}
