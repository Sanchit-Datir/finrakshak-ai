import type { SynthArchetype } from '@fund-tracker/shared';
import { control } from './control.js';
import { fundDiversion } from './fundDiversion.js';
import { slowBurn } from './slowBurn.js';
import { suddenEnforcement } from './suddenEnforcement.js';
import type { Archetype } from './types.js';

/** The scenarios built so far; the others in `SYNTH_ARCHETYPES` come with step 6 of docs/plans/README.md. */
export const ARCHETYPES: Readonly<Partial<Record<SynthArchetype, Archetype>>> = {
  control,
  slow_burn: slowBurn,
  sudden_enforcement: suddenEnforcement,
  fund_diversion: fundDiversion,
};
