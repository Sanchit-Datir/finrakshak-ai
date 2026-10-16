import { advantageOverseasPostDisbursement } from './advantage-overseas-post-disbursement/scenario.js';
import { maheepTradeCreditChain } from './maheep-trade-credit-chain/scenario.js';
import type { LoanScenario, MonitoringScenario } from './types.js';

/** Pre-disbursement (loan application) scenarios: tests/loan-scenarios.spec.ts. */
export const SCENARIOS: readonly LoanScenario[] = [maheepTradeCreditChain];

/** Post-disbursement (public-records watch) scenarios: tests/monitoring-scenarios.spec.ts. */
export const MONITORING_SCENARIOS: readonly MonitoringScenario[] = [
  advantageOverseasPostDisbursement,
];
