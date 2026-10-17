import { useSyncExternalStore } from 'react';
import { createDemoDb, createEmptyDb } from '../demo/seed.js';
import { DbSchema, type Db } from '../domain/schemas.js';

/**
 * Prototype data store. Persists to this browser's localStorage only — there is
 * no backend database yet. Everything read back is validated with zod; invalid
 * or outdated data is replaced with a fresh set of sample records (and the user is told).
 */

const KEY = 'fundtrace.demo.v2';

export interface StoreStatus {
  /** Set when stored data could not be read and was reset. */
  loadIssue: string | null;
  /** Set when the latest change could not be saved to browser storage. */
  saveError: string | null;
}

function readStored(): { db: Db; issue: string | null } {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return {
      db: createDemoDb(),
      issue: 'Browser storage is unavailable; changes will last only until you close this tab.',
    };
  }
  if (raw === null) return { db: createDemoDb(), issue: null };
  try {
    const parsed = DbSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { db: parsed.data, issue: null };
  } catch {
    // fall through to reset
  }
  return {
    db: createDemoDb(),
    issue:
      'Saved data was unreadable or from an older version, so the sample records were reloaded.',
  };
}

const initial = readStored();
let current: Db = initial.db;
let status: StoreStatus = { loadIssue: initial.issue, saveError: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
    if (status.saveError !== null) status = { ...status, saveError: null };
  } catch {
    status = {
      ...status,
      saveError:
        'Could not save to browser storage (it may be full or disabled). Recent changes may be lost on reload.',
    };
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDb(): Db {
  return current;
}

/** Applies an immutable update via a draft copy, persists, and notifies subscribers. */
export function mutate(recipe: (draft: Db) => void): void {
  const draft = structuredClone(current);
  recipe(draft);
  current = draft;
  persist();
  emit();
}

export function replaceDb(next: Db): void {
  current = next;
  persist();
  emit();
}

export function resetToDemo(): void {
  const prefs = current.settings;
  const fresh = createDemoDb();
  replaceDb({
    ...fresh,
    settings: { ...fresh.settings, profile: prefs.profile, preferences: prefs.preferences },
  });
}

export function clearWorkspace(): void {
  const prefs = current.settings;
  const empty = createEmptyDb();
  replaceDb({
    ...empty,
    settings: { ...empty.settings, profile: prefs.profile, preferences: prefs.preferences },
  });
}

export function dismissLoadIssue(): void {
  status = { ...status, loadIssue: null };
  emit();
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, getDb);
}

export function useStoreStatus(): StoreStatus {
  return useSyncExternalStore(subscribe, () => status);
}

let idSeq = 0;
/** Locally unique id for notes/audit rows. */
export function uid(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
