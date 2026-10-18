import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { RoleSchema, type Role } from '../domain/schemas.js';

/**
 * Two kinds of session:
 *  - a DEMO session: the chosen display name and role in browser storage; no credential is checked.
 *    It is not access control and never reaches the cloud features.
 *  - a CLOUD session: a Firebase sign-in plus the person's profile from the server (name, role,
 *    branch, AI on/off). It lives in memory only; Firebase itself restores the sign-in on reload.
 * A cloud session wins when both exist. Anything that must really be protected is enforced on the
 * server, not by what this module says.
 */

const KEY = 'finrakshak-ai.session.v1';

const SessionSchema = z.object({
  name: z.string().min(1),
  employeeId: z.string(),
  role: RoleSchema,
  branchId: z.string(),
  signedInAt: z.string(),
  remember: z.boolean(),
  demo: z.literal(true),
});
export type DemoSession = z.infer<typeof SessionSchema>;

export interface CloudSession {
  name: string;
  employeeId: string;
  role: Role;
  branchId: string;
  signedInAt: string;
  remember: boolean;
  demo: false;
  /** Firebase user ID, the key of this person's profile and what the owner enables. */
  uid: string;
  email: string | null;
  aiEnabled: boolean;
}

export type Session = DemoSession | CloudSession;

function read(): DemoSession | null {
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

let demoCurrent: DemoSession | null = read();
let cloudCurrent: CloudSession | null = null;
let current: Session | null = demoCurrent;
const listeners = new Set<() => void>();

function recompute(): void {
  current = cloudCurrent ?? demoCurrent;
  for (const l of listeners) l();
}

/** Set (or clear, with null) the cloud session. Called by the cloud sign-in module. */
export function setCloudSession(next: CloudSession | null): void {
  cloudCurrent = next;
  recompute();
}

let signOutHook: (() => void) | null = null;

/** The cloud module registers how to sign out of Firebase, so ending a session ends both. */
export function registerSignOutHook(hook: () => void): void {
  signOutHook = hook;
}

export function startDemoSession(input: {
  name: string;
  employeeId: string;
  role: Role;
  branchId: string;
  remember: boolean;
}): void {
  demoCurrent = { ...input, signedInAt: new Date().toISOString(), demo: true };
  const target = input.remember
    ? safe(() => window.localStorage)
    : safe(() => window.sessionStorage);
  const value = JSON.stringify(demoCurrent);
  safe(() => target?.setItem(KEY, value));
  recompute();
}

export function endSession(): void {
  demoCurrent = null;
  cloudCurrent = null;
  signOutHook?.();
  safe(() => {
    window.localStorage.removeItem(KEY);
  });
  safe(() => {
    window.sessionStorage.removeItem(KEY);
  });
  recompute();
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
  // Only a demo session is editable in the browser; a cloud profile is managed by the administrator.
  if (demoCurrent === null) return;
  demoCurrent = { ...demoCurrent, ...patch };
  const target = demoCurrent.remember
    ? safe(() => window.localStorage)
    : safe(() => window.sessionStorage);
  const value = JSON.stringify(demoCurrent);
  safe(() => {
    target?.setItem(KEY, value);
  });
  recompute();
}
