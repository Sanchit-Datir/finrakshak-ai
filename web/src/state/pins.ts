import { z } from 'zod';
import { localPref, useLocalPref } from './local-pref.js';

/** Records pinned to the sidebar (per browser, at most MAX_PINS, newest first). */

export const MAX_PINS = 5;

const PinSchema = z.object({
  href: z.string().startsWith('/').max(200),
  title: z.string().min(1).max(120),
  kind: z.enum(['application', 'borrower', 'loan', 'case']),
});
export type Pin = z.infer<typeof PinSchema>;

const pinsPref = localPref<Pin[]>('finrakshak.sidebar.pins', z.array(PinSchema).max(MAX_PINS), []);

export function usePins(): Pin[] {
  return useLocalPref(pinsPref);
}

export function isPinned(pins: readonly Pin[], href: string): boolean {
  return pins.some((p) => p.href === href);
}

/** Pins or unpins; pinning past the limit drops the oldest pin. */
export function togglePin(pin: Pin): void {
  const pins = pinsPref.get();
  pinsPref.set(
    isPinned(pins, pin.href)
      ? pins.filter((p) => p.href !== pin.href)
      : [pin, ...pins].slice(0, MAX_PINS),
  );
}

export function unpin(href: string): void {
  pinsPref.set(pinsPref.get().filter((p) => p.href !== href));
}
