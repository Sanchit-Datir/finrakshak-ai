import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

/**
 * A small per-browser preference (sidebar pins, branch scope). Values are zod-checked on read;
 * if storage is unavailable the value still works for this tab, it just is not kept.
 */
export interface LocalPref<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
  fallback: T;
}

export function localPref<T>(key: string, schema: z.ZodType<T>, fallback: T): LocalPref<T> {
  let cached: { value: T } | null = null;
  const listeners = new Set<() => void>();

  const read = (): T => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : fallback;
    } catch {
      return fallback;
    }
  };
  const get = (): T => {
    cached ??= { value: read() };
    return cached.value;
  };
  const notify = (): void => {
    for (const l of listeners) l();
  };
  const set = (value: T): void => {
    cached = { value };
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // A preference only: storage may be full or disabled; the value still applies in this tab.
    }
    notify();
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== key) return;
      cached = null;
      listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  };
  return { get, set, subscribe, fallback };
}

/** Reads a preference and re-renders when it changes (in this tab or another). */
export function useLocalPref<T>(pref: LocalPref<T>): T {
  return useSyncExternalStore(pref.subscribe, pref.get, () => pref.fallback);
}
