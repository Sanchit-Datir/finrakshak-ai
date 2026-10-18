import { useEffect, useMemo } from 'react';
import { formatDate, formatDateTime, type DateOptions } from '../lib/format.js';
import { useSession } from './session.js';
import { useDb } from './store.js';

export interface Formatter {
  date: (iso: string | null) => string;
  dateTime: (iso: string | null) => string;
  opts: DateOptions;
}

export function useFormat(): Formatter {
  const { dateFormat, timezone } = useDb().settings.preferences;
  return useMemo(() => {
    const opts = { dateFormat, timezone };
    return {
      date: (iso) => formatDate(iso, opts),
      dateTime: (iso) => formatDateTime(iso, opts),
      opts,
    };
  }, [dateFormat, timezone]);
}

/** Name of the signed-in demo user, used as the actor in audit entries. */
export function useActor(): string {
  return useSession()?.name ?? 'Unknown user';
}

/** Applies the theme preference (light / dark / system) to <html>. */
export function useThemeEffect(): void {
  const theme = useDb().settings.preferences.theme;
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
    };
  }, [theme]);
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · FinRakshak AI`;
  }, [title]);
}
