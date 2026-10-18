import { z } from 'zod';
import type { Command } from './search-index.js';

/** Recently opened palette items, kept per browser (non-essential, so failures are ignored). */

const KEY = 'finrakshak.palette.recent';
const MAX = 5;

const RecentSchema = z.array(
  z.object({ id: z.string(), title: z.string(), detail: z.string(), href: z.string() }),
);

export function readRecent(): Command[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = RecentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.map((r) => ({ ...r, group: 'Recent' as const })) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(c: Command): void {
  if (c.href === undefined) return;
  const entry = { id: c.id, title: c.title, detail: c.detail, href: c.href };
  const next = [entry, ...readRecent().filter((r) => r.href !== entry.href)].slice(0, MAX);
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(next.map(({ id, title, detail, href }) => ({ id, title, detail, href }))),
    );
  } catch {
    // Recent items are a convenience; storage may be full or disabled.
  }
}
