import { maheepTradeCreditChain } from './maheep-trade-credit-chain/scenario.js';
import type { LoanScenario } from './types.js';

/** Every scenario listed here runs in tests/loan-scenarios.spec.ts. Add new ones below. */
export const SCENARIOS: readonly LoanScenario[] = [maheepTradeCreditChain];
