/**
 * SYNTHETIC TEST SCENARIOS — fictional organisations ("SYNTH …") and example.invalid
 * URLs. They exercise benign and ambiguous patterns so the graph can be checked for
 * misleading conclusions. Never present these as real findings.
 */
export const SCENARIOS = [
  [
    'S1',
    'Benign shared address',
    'Three unrelated companies at one co-working address form a low-score network with no adverse records.',
  ],
  [
    'S2',
    'Service address hub',
    'Twelve companies at one address: the address is a hub and links nobody.',
  ],
  [
    'S3',
    'Large-bank creditor hub',
    'A bank filing against eight debtors does not chain those debtors into a network.',
  ],
  [
    'S4',
    'Specific creditor',
    'A small lender filing against two debtors links them (established, strong).',
  ],
  [
    'S5',
    'Ambiguous names',
    '"Shree Ganesh Steels Pvt Ltd" vs "Shree Ganesh Steel Ltd" stay separate and appear only as an identity candidate.',
  ],
  [
    'S6',
    'Same name, different towns',
    'Two "Urban Co-operative Bank" entries in different towns are neither merged nor proposed as identical.',
  ],
  [
    'S7',
    'Documented co-party',
    'Two companies named in the same order are linked through that order, with evidence.',
  ],
  [
    'S8',
    'Text mention only',
    'A company only mentioned in a press release is a weak candidate link, not a network member.',
  ],
  [
    'S9',
    'Batch notice',
    'An RBI notice cancelling eight registrations is a hub and links none of them.',
  ],
  [
    'S10',
    'Group companies',
    'Two registered companies with similar names at one address are linked through the address but never proposed as the same entity (different CINs).',
  ],
] as const;

export const scenarioNotes = (): string[] =>
  SCENARIOS.map(([id, title, expect]) => `${id} ${title}: ${expect}`);
