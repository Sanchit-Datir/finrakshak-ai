import type {
  SynthArchetype,
  SynthEntity,
  SynthFlag,
  SynthLoan,
  SynthRelationship,
  SynthTruth,
} from '@fund-tracker/shared';
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
