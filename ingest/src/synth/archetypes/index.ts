import type { SynthArchetype } from '@fund-tracker/shared';
import { bigPrepayment } from './bigPrepayment.js';
import { cashSplit } from './cashSplit.js';
import { contagion } from './contagion.js';
import { control } from './control.js';
import { dormantBurst } from './dormantBurst.js';
import { fundDiversion } from './fundDiversion.js';
import { nearThreshold } from './nearThreshold.js';
import { roundTrip } from './roundTrip.js';
import { seasonal } from './seasonal.js';
import { sharedAddress } from './sharedAddress.js';
import { slowBurn } from './slowBurn.js';
import { suddenEnforcement } from './suddenEnforcement.js';
import type { Archetype, GroupArchetype } from './types.js';

/** Every scenario in `SYNTH_ARCHETYPES`: single loans, plus the cluster scenario that builds loans in groups. */
export const ARCHETYPES: Readonly<Partial<Record<SynthArchetype, Archetype | GroupArchetype>>> = {
  control,
  slow_burn: slowBurn,
  sudden_enforcement: suddenEnforcement,
  round_trip: roundTrip,
  fund_diversion: fundDiversion,
  contagion,
  shared_address: sharedAddress,
  cash_split: cashSplit,
  dormant_burst: dormantBurst,
  seasonal,
  big_prepayment: bigPrepayment,
  near_threshold: nearThreshold,
};
