import type { Money } from '@finrakshak-ai/shared';

/** Indian state/UT codes used in CINs. */
const CIN_STATES = new Set(
  'AN AP AR AS BR CH CT CG DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OR OD PB PY RJ SK TG TN TR TS UK UP UR UT WB'.split(
    ' ',
  ),
);
const CIN_RE = /\b([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})\b/g;

/** Corporate Identification Numbers with a plausible structure (state code, year). */
export function findCins(text: string): { cin: string; index: number }[] {
  const out: { cin: string; index: number }[] = [];
  for (const m of text.matchAll(CIN_RE)) {
    const year = Number(m[4]);
    if (!CIN_STATES.has(m[3] ?? '') || year < 1850 || year > 2030) continue;
    out.push({ cin: m[0], index: m.index });
  }
  return out;
}

const UNIT: Readonly<Record<string, bigint>> = {
  crore: 10_000_000n,
  cr: 10_000_000n,
  lakh: 100_000n,
  lac: 100_000n,
  million: 1_000_000n,
  billion: 1_000_000_000n,
};

function unitMultiplier(unit: string | undefined): bigint {
  if (!unit) return 1n;
  const key = unit
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  return UNIT[key] ?? 1n;
}

/**
 * Converts "62.70" + "crore" to integer paise without floating point (B-01).
 * Returns null when the value is not a whole number of paise (B-05: no silent
 * rounding) or exceeds the safe-integer range (B-03).
 */
export function toInrMinor(numberText: string, unit?: string): Money | null {
  const cleaned = numberText.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [intPart = '0', frac = ''] = cleaned.split('.');
  const scale = 10n ** BigInt(frac.length);
  const scaledRupees = (BigInt(intPart) * scale + BigInt(frac || '0')) * unitMultiplier(unit);
  const paiseTimesScale = scaledRupees * 100n;
  if (paiseTimesScale % scale !== 0n) return null;
  const minor = paiseTimesScale / scale;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { minor: Number(minor), currency: 'INR' };
}

export interface AmountMention {
  readonly money: Money;
  readonly raw: string;
  readonly index: number;
}

const AMOUNT_RE =
  /(?:Rs\.?|INR|₹|Rupees)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(crores?|cr\.?|lakhs?|lacs?|million|billion)?(?![A-Za-z0-9])/gi;

export function findAmounts(text: string): AmountMention[] {
  const out: AmountMention[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const money = toInrMinor(m[1] ?? '', m[2]);
    if (money && money.minor > 0) out.push({ money, raw: m[0].trim(), index: m.index });
  }
  return out;
}

const SUFFIX =
  '(?:Private\\s+Limited|PRIVATE\\s+LIMITED|Pvt\\.?\\s*Ltd\\.?|PVT\\.?\\s*LTD\\.?|Limited|LIMITED|Ltd\\.?|LTD\\.?|LLP)';
const WORD =
  "(?:[A-Z][A-Za-z0-9'’.\\-]*|\\d+[A-Za-z]*|&|and|AND|of|OF|\\((?:India|INDIA|I|P|Pvt)\\))";
const COMPANY_RE = new RegExp(
  `\\b([A-Z][A-Za-z0-9'’.\\-]*(?:\\s+${WORD}){0,9})\\s+(${SUFFIX})(?![A-Za-z])`,
  'g',
);

const LEADING_NOISE =
  /^(?:(?:M\/s\.?|Messrs\.?|The|THE|In|Re|Of|of|on|On|And|Order|ORDER|Final|Adjudication|Settlement|Against|Noticee|Notice|Matter|Mr\.?|Ms\.?|Mrs\.?|RBI|Directions|Show|Cause|Respect|Under|Section|SEBI|vs\.?|Vs\.?|v\.?|Licen[cs]e|Cancellation|Certificate|Registration|Amalgamation|Merger|Scheme|Penalty|Monetary|Voluntary|Withdrawal|Revocation|Extension|Modification|Period|Liquidation|Press|Release|Annexure)\s+)+/;
const GENERIC_CORE =
  /^(?:the\s+)?(?:company|private|pvt\.?|public|listed|unlisted|said|such|holding|bank|group|its|subsidiary|co\.?|corporation)$/i;

/** Company / LLP names ending with a legal-form suffix. Noisy by nature: candidates, not truth. */
export function findCompanyNames(text: string): { name: string; index: number }[] {
  const out: { name: string; index: number }[] = [];
  for (const m of text.replace(/M\/s\.?(?=\S)/g, 'M/s ').matchAll(COMPANY_RE)) {
    const core = (m[1] ?? '').replace(LEADING_NOISE, '').trim();
    if (core.length < 3 || GENERIC_CORE.test(core)) continue;
    out.push({ name: `${core} ${m[2] ?? ''}`.replace(/\s+/g, ' ').trim(), index: m.index });
  }
  return out;
}

/** Up to `width` characters around `index`, for evidence excerpts. */
export function excerptAround(text: string, index: number, width = 240): string {
  const start = Math.max(0, index - Math.floor(width / 2));
  return text
    .slice(start, start + width)
    .replace(/\s+/g, ' ')
    .trim();
}
