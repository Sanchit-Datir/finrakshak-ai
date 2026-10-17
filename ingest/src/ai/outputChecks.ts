/**
 * The shared output check of AGENTS_PLAN.md ("What the new agents add"): every number a model writes
 * must be one the code computed. Used by the pattern miner and the risk explainer, so the rule is
 * written once. The model may repeat numbers; it may never count, average or invent one.
 */

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;

/** Numbers written in a text: `12`, `1.5`, `1,200`; a date `2026-10-06` gives 2026, 10 and 6. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, '')));
}

/** Numbers in `text` that are not in `allowed` (empty when the text repeats only known numbers). */
export function unknownNumbers(text: string, allowed: Iterable<number>): number[] {
  const known = new Set(allowed);
  return [...new Set(numbersIn(text))].filter((n) => !known.has(n));
}

/** Every number anywhere in a code-computed value (keys and strings included), for `unknownNumbers`. */
export const numbersOf = (value: unknown): number[] => numbersIn(JSON.stringify(value));
