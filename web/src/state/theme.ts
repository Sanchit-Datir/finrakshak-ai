import type { Settings } from '../domain/schemas.js';
import { mutate } from './store.js';

type Theme = Settings['preferences']['theme'];

/** The theme actually on screen, resolving "system" against the OS setting. */
export function effectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Flips between light and dark (an explicit choice replaces "system"). */
export function toggleTheme(current: Theme): void {
  const next = effectiveTheme(current) === 'dark' ? 'light' : 'dark';
  mutate((d) => {
    d.settings.preferences.theme = next;
  });
}
