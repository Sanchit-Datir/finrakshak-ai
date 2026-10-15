import { z } from 'zod';

/** ISO-4217 currency code, e.g. "INR", "USD". */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);

/**
 * Money is ALWAYS integer minor units (paise, cents). Never floats.
 * See docs/BOUNDARY_CONDITIONS.md (B-01).
 */
export const MoneySchema = z.object({
  minor: z.number().int().safe(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  const minor = a.minor + b.minor;
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Money overflow');
  }
  return { minor, currency: a.currency };
}
