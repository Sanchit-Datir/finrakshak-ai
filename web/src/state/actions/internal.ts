/** Lookups and the audit entry shared by every action module. */

import type { Application, AuditEntry, Db, FtDocument } from '../../domain/schemas.js';
import { nowIso, uid } from '../store.js';

/** All state changes go through here so every change leaves an audit entry. */

export function audit(actor: string, action: string, detail: string): AuditEntry {
  return { id: uid('au'), at: nowIso(), actor, action, detail };
}

export function findApp(d: Db, id: string): Application {
  const a = d.applications.find((x) => x.id === id);
  if (a === undefined) throw new Error(`Application ${id} not found`);
  return a;
}

export function findDoc(d: Db, id: string): FtDocument {
  const doc = d.documents.find((x) => x.id === id);
  if (doc === undefined) throw new Error(`Document ${id} not found`);
  return doc;
}

export function newDocId(d: Db): string {
  d.counters.document += 1;
  return `D-${String(d.counters.document).padStart(4, '0')}`;
}

export function findCase(d: Db, id: string): Db['cases'][number] {
  const c = d.cases.find((x) => x.id === id);
  if (c === undefined) throw new Error(`Case ${id} not found`);
  return c;
}
