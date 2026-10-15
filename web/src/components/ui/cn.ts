/** Joins class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p) => typeof p === 'string' && p !== '').join(' ');
}
