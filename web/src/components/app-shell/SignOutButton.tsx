import { LogOut } from 'lucide-react';
import { useSignOut } from '../../state/useSignOut.js';

/**
 * Always visible in the top bar, on every screen size: the profile menu that also holds "Sign out" is
 * tucked into the sidebar on phones and large screens, which made signing out hard to find.
 */
export function SignOutButton(): React.JSX.Element {
  const signOut = useSignOut();
  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      title="Sign out"
      className="text-muted hover:text-ink hover:bg-surface-2 inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium sm:px-3"
    >
      <LogOut className="size-5" aria-hidden />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
