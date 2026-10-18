/** Name, date, identifier and number normalisation used to compare document fields. */

import { nameSimilarity, normalizeDigits, normalizeName } from '../text.js';

export type NameVerdict = 'match' | 'variation' | 'mismatch';

/** Order-insensitive token comparison that tolerates initials and minor spelling variants. */
export function compareNames(a: string, b: string): NameVerdict {
  const ta = normalizeName(a)
    .split(' ')
    .filter((t) => t !== '');
  const tb = normalizeName(b)
    .split(' ')
    .filter((t) => t !== '');
  if (ta.length === 0 || tb.length === 0) return 'mismatch';
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let exact = true;
  const used = new Set<number>();
  for (const tok of short) {
    let idx = long.findIndex((l, i) => !used.has(i) && l === tok);
    if (idx < 0) {
      exact = false;
      idx = long.findIndex(
        (l, i) =>
          !used.has(i) &&
          ((tok.length === 1 && l.startsWith(tok)) ||
            (l.length === 1 && tok.startsWith(l)) ||
            nameSimilarity(l, tok) >= 0.8),
      );
    }
    if (idx < 0) return 'mismatch';
    used.add(idx);
  }
  if (short.length !== long.length) exact = false;
  return exact ? 'match' : 'variation';
}

/** Parses YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY (any digits) to YYYY-MM-DD. */
export function normalizeDate(raw: string): string | null {
  const s = normalizeDigits(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d = '', m = '', y = ''] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export function normalizeIdentifier(raw: string): string {
  return normalizeDigits(raw).replace(/\s+/g, '').toUpperCase();
}

export function parseNumber(raw: string): number | null {
  const s = normalizeDigits(raw).replace(/[₹,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

export const NIL = /निरंक|^\s*(nil|none|no)\s*$|बोजा\s*[—-]\s*निरंक/i;
