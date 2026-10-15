import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { RoleSchema, type Role } from '../domain/schemas.js';

/**
 * DEMO SESSION ONLY. Real authentication is not implemented. A demo session
 * stores the chosen display name and role in browser storage; no credential is
 * checked or stored. Do not treat this as access control.
 */

const KEY = 'fundtrace.session.v1';

const SessionSchema = z.object({
  name: z.string().min(1),
  employeeId: z.string(),
  role: RoleSchema,
  branchId: z.string(),
  signedInAt: z.string(),
  remember: z.boolean(),
  demo: z.literal(true),
});
export type Session = z.infer<typeof SessionSchema>;

function read(): Session | null {
  for (const store of [safe(() => window.sessionStorage), safe(() => window.localStorage)]) {
    const raw = store === null ? null : safe(() => store.getItem(KEY));
    if (raw === null) continue;
    try {
      const parsed = SessionSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // ignore malformed session
    }
  }
  return null;
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

let current: Session | null = read();
const listeners = new Set<() => void>();

export function startDemoSession(input: {
  name: string;
  employeeId: string;
  role: Role;
  branchId: string;
  remember: boolean;
}): void {
  current = { ...input, signedInAt: new Date().toISOString(), demo: true };
  const target = input.remember
    ? safe(() => window.localStorage)
    : safe(() => window.sessionStorage);
  safe(() => target?.setItem(KEY, JSON.stringify(current)));
  for (const l of listeners) l();
}

export function endSession(): void {
  current = null;
  safe(() => {
    window.localStorage.removeItem(KEY);
  });
  safe(() => {
    window.sessionStorage.removeItem(KEY);
  });
  for (const l of listeners) l();
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}

const CAN_CONFIGURE: ReadonlySet<Role> = new Set(['risk_analyst', 'administrator']);

/** UI-only permission check for the demo. Real enforcement must happen server-side. */
export function canConfigureRules(role: Role | undefined): boolean {
  return role !== undefined && CAN_CONFIGURE.has(role);
}

export function updateDemoSession(
  patch: Partial<Pick<Session, 'name' | 'employeeId' | 'branchId'>>,
): void {
  if (current === null) return;
  current = { ...current, ...patch };
  const target = current.remember
    ? safe(() => window.localStorage)
    : safe(() => window.sessionStorage);
  const value = JSON.stringify(current);
  safe(() => {
    target?.setItem(KEY, value);
  });
  for (const l of listeners) l();
}
