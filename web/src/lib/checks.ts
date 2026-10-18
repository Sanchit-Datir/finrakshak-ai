/**
 * Deterministic pre-disbursement checks (spec §7 step 4, §8). They run in the
 * browser over the application form and reviewed document fields. Findings are
 * prompts for human verification, not lending decisions.
 *
 * One module per group of rules in `./checks/`; the registry is `CHECKS` in `./checks/run.ts`.
 */

export { CATEGORY_LABEL } from './checks/types.js';

export type {
  CrossCheck,
  CrossVerdict,
  EvidenceRef,
  Finding,
  FindingCategory,
} from './checks/types.js';

export { compareNames, normalizeDate, normalizeIdentifier } from './checks/normalize.js';

export type { NameVerdict } from './checks/normalize.js';

export {
  CHECK_NAMES,
  applicationDocs,
  loanAlertsForApplication,
  reviewPriority,
  runChecks,
} from './checks/run.js';

export { crossChecks } from './checks/cross-checks.js';
