/** Text utilities for Devanagari/English comparison. */

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** True if the string contains Devanagari characters. */
export function hasDevanagari(s: string): boolean {
  return /[ऀ-ॿ]/.test(s);
}

/**
 * Converts Devanagari digits to ASCII digits for *comparison only*.
 * Callers must keep and display the original string (spec §17).
 */
export function normalizeDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const i = DEVANAGARI_DIGITS.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

/** Normalises a Latin-script name for fuzzy comparison. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .join(' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/**
 * Token-order-insensitive similarity in [0, 1]. A heuristic — similar names
 * are NOT proof of identity (spec §8).
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a).split(' ').sort().join(' ');
  const nb = normalizeName(b).split(' ').sort().join(' ');
  if (na.length === 0 || nb.length === 0) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/** Simple case-insensitive substring match across several haystacks. */
export function matchesQuery(query: string, ...haystacks: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(q));
}
