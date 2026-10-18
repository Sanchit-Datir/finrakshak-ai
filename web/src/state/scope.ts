import { z } from 'zod';
import { localPref, useLocalPref } from './local-pref.js';
import { useSession } from './session.js';
import { useDb } from './store.js';

/**
 * The branch the person is looking at across the app: "all" or one branch id. Lists use it as their
 * default branch filter. Branch officers always see their own branch only, as on the dashboard.
 * A scoped view must never hide urgent work silently: the sidebar shows urgent items elsewhere (B-65).
 */
const scopePref = localPref('finrakshak.scope.branch', z.string().min(1).max(60), 'all');

export interface BranchScope {
  scope: string;
  setScope: (branchId: string) => void;
  /** True when the role cannot change branch (branch officers). */
  locked: boolean;
}

export function useBranchScope(): BranchScope {
  const session = useSession();
  const db = useDb();
  const stored = useLocalPref(scopePref);
  const locked = session?.role === 'branch_officer';
  if (locked) return { scope: session.branchId, setScope: () => undefined, locked };
  const known = stored === 'all' || db.branches.some((b) => b.id === stored);
  return { scope: known ? stored : 'all', setScope: scopePref.set, locked };
}
