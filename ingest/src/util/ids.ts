import { createHash } from 'node:crypto';

/** Deterministic short id: same input → same id, so re-runs are idempotent (B-24). */
export function stableId(prefix: string, ...parts: readonly string[]): string {
  const h = createHash('sha1').update(parts.join('␟')).digest('hex').slice(0, 16);
  return `${prefix}_${h}`;
}

export function cleanText(s: string): string {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolves a possibly relative / space-containing href to an absolute, encoded URL. */
export function absoluteUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0 || /^(javascript|mailto|tel):/i.test(trimmed)) return null;
  try {
    return new URL(trimmed.replace(/ /g, '%20'), base).href;
  } catch {
    return null;
  }
}
