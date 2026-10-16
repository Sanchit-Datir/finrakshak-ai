import type { EntityType } from '@fund-tracker/shared';

const SUFFIX_RULES: readonly (readonly [RegExp, string])[] = [
  [/\b(PRIVATE|PVT|PVT\.)\s*(LIMITED|LTD)\b\.?/g, 'PRIVATE LIMITED'],
  [/\bP\s+LTD\b\.?/g, 'PRIVATE LIMITED'],
  [/\bLTD\b\.?/g, 'LIMITED'],
  [/\bCO\b\.?/g, 'COMPANY'],
  [/\bCORPN\b\.?/g, 'CORPORATION'],
];

const STATUS_TAILS =
  /\s*[-–(]?\s*(?:IN\s+LIQUIDATION|UNDER\s+LIQUIDATION|IN\s+CIRP|UNDER\s+CIRP|IN\s+CORPORATE\s+INSOLVENCY\s+RESOLUTION\s+PROCESS|FORMERLY\s+KNOWN\s+AS\s+.*|FORMERLY\s+.*|NOW\s+KNOWN\s+AS\s+.*)\)?\s*$/;

/**
 * Canonical comparison key for company names (B-26: Unicode-normalised).
 * "M/s. ABC Pvt. Ltd." and "ABC PRIVATE LIMITED" → "ABC PRIVATE LIMITED".
 */
export function normalizeCompanyName(name: string): string {
  let s = name.normalize('NFKC').toUpperCase().replace(/[’`]/g, "'");
  s = s.replace(/^(M\/S\.?|MESSRS\.?|THE)\s+/, '').replace(STATUS_TAILS, '');
  s = s.replace(/&/g, ' AND ').replace(/[^A-Z0-9' ]+/g, ' ');
  for (const [re, rep] of SUFFIX_RULES) s = s.replace(re, rep);
  return s.replace(/'/g, '').replace(/\s+/g, ' ').trim();
}

const PERSON_TITLES = /^(?:(?:MR|MRS|MS|MISS|DR|CA|CS|SHRI|SMT|ADV|CMA|PROF)\.?\s+)+/;

export function normalizePersonName(name: string): string {
  return name
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z. ]+/g, ' ')
    .replace(PERSON_TITLES, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heuristic type from the name alone; refined later by source context. */
export function guessEntityType(normalized: string): EntityType {
  if (/\bBANK\b/.test(normalized)) return 'bank';
  if (/\bLLP\b|\bAND (CO|COMPANY|ASSOCIATES)\b|\bCHARTERED ACCOUNTANTS\b/.test(normalized)) {
    return /\bLLP\b/.test(normalized) && !/\bAND (CO|COMPANY|ASSOCIATES)\b/.test(normalized)
      ? 'llp'
      : 'audit_firm';
  }
  if (/\b(LIMITED|CORPORATION|COMPANY)\b/.test(normalized)) return 'company';
  if (/\b(GOVERNMENT|MINISTRY|DIRECTORATE|COMMISSIONER|BOARD|AUTHORITY)\b/.test(normalized))
    return 'government_body';
  return 'other_org';
}

/** Whether a free-text party (e.g. an IBBI "applicant") looks like an organisation. */
export function looksLikeOrganisation(name: string): boolean {
  return /\b(LIMITED|LTD|LLP|BANK|CORPORATION|COMPANY|CO\.|TRUST|FUND|SOCIETY|ASSOCIATION|FINANCE|CAPITAL|INDUSTRIES|ENTERPRISES)\b/i.test(
    name,
  );
}

/** Token-set Jaccard similarity on normalised names (for review candidates only). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((t) => !['LIMITED', 'PRIVATE', 'AND', 'THE'].includes(t)));
  const tb = new Set(b.split(' ').filter((t) => !['LIMITED', 'PRIVATE', 'AND', 'THE'].includes(t)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
