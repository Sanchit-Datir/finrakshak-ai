import { Menu } from 'lucide-react';
import { Link } from 'react-router';
import { GlobalSearch } from './GlobalSearch.js';
import { LogoMark } from './Logo.js';
import { Notifications } from './Notifications.js';
import { SignOutButton } from './SignOutButton.js';
import { UserMenu } from './UserMenu.js';

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }): React.JSX.Element {
  return (
    <header className="no-print border-line bg-surface/95 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur sm:gap-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="text-muted hover:text-ink hover:bg-surface-2 rounded-lg p-2 lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <Link to="/dashboard" className="lg:hidden" aria-label="FundTrace AI dashboard">
        <LogoMark />
      </Link>
      <GlobalSearch className="max-w-xl min-w-0 flex-1" />
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Notifications />
        <div className="hidden sm:block lg:hidden">
          <UserMenu compact placement="header" />
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
