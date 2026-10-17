import { DAY } from './calendar.js';
import { GENERATOR_VERSION, generate } from './generate.js';

/** Fixed inputs, so the committed sample can be checked against a fresh build. */
export const SAMPLE_SEED = 20261017;
export const SAMPLE_MONTHS = 12;
export const SAMPLE_ALLOCATION = {
  control: 1,
  fund_diversion: 1,
  round_trip: 1,
  cash_split: 1,
  shared_address: 2,
  near_threshold: 1,
} as const;

/**
 * Every monitoring rule looks only at the first 90 days of a loan (`monitoringDays`), so the sample keeps
 * a little more than that and drops the rest. The rules give the same answer, and the file stays small.
 */
const KEEP_DAYS = 91;

/**
 * The small contract sample as JSON text: loans, entities, relationships, transactions and the expected
 * rules, with no flags. The web tests load it into the app's own monitoring rules (docs/plans, step 5).
 */
export function buildSample(): string {
  const d = generate({ seed: SAMPLE_SEED, months: SAMPLE_MONTHS, allocation: SAMPLE_ALLOCATION });
  const disbursed = new Map(d.loans.map((l) => [l.id, Date.parse(l.disbursedAt)]));
  const transactions = d.transactions.filter(
    (t) => Date.parse(t.at) <= (disbursed.get(t.loanId ?? '') ?? 0) + KEEP_DAYS * DAY,
  );
  return `${JSON.stringify({
    synthetic: true,
    generator_version: GENERATOR_VERSION,
    seed: SAMPLE_SEED,
    entities: d.entities,
    relationships: d.relationships,
    loans: d.loans,
    transactions,
    truth: d.truth.map((t) => ({
      loan_id: t.loan_id,
      archetype: t.archetype,
      expected_rules: t.expected_rules,
    })),
  })}\n`;
}
