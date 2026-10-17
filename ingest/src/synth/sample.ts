import { GENERATOR_VERSION, generate } from './generate.js';

/** Fixed inputs, so the committed sample can be checked against a fresh build. */
export const SAMPLE_SEED = 20261017;
export const SAMPLE_MONTHS = 14;
export const SAMPLE_ALLOCATION = {
  control: 2,
  slow_burn: 1,
  sudden_enforcement: 1,
  fund_diversion: 1,
} as const;

/**
 * The small contract sample as JSON text: loans, entities, relationships, transactions and the expected
 * rules, with no flags. The web tests load it into the app's own monitoring rules (docs/plans, step 5).
 */
export function buildSample(): string {
  const d = generate({ seed: SAMPLE_SEED, months: SAMPLE_MONTHS, allocation: SAMPLE_ALLOCATION });
  return `${JSON.stringify({
    synthetic: true,
    generator_version: GENERATOR_VERSION,
    seed: SAMPLE_SEED,
    entities: d.entities,
    relationships: d.relationships,
    loans: d.loans,
    transactions: d.transactions,
    truth: d.truth.map((t) => ({
      loan_id: t.loan_id,
      archetype: t.archetype,
      expected_rules: t.expected_rules,
    })),
  })}\n`;
}
