import { CircleHelp, Menu, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { LinkButton } from '../ui/Button.js';
import { DemoBadge } from '../ui/States.js';
import { GlobalSearch } from './GlobalSearch.js';
import { LogoMark } from './Logo.js';
import { Notifications } from './Notifications.js';
import { SignOutButton } from './SignOutButton.js';
import { UserMenu } from './UserMenu.js';

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }): React.JSX.Element {
  // The dashboard header has its own primary button; avoid showing two side by side.
  const onDashboard = useLocation().pathname === '/dashboard';
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
      <div className="hidden md:block">
        <DemoBadge />
      </div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {/* Wrapper controls visibility: the button's own inline-flex would override `hidden`. */}
        <div className={onDashboard ? 'hidden' : 'hidden sm:block'}>
          <LinkButton to="/applications/new" variant="primary" icon={Plus}>
            New Application
          </LinkButton>
        </div>
        <Link
          to="/help"
          aria-label="Help"
          className="text-muted hover:text-ink hover:bg-surface-2 hidden size-10 items-center justify-center rounded-lg md:inline-flex"
        >
          <CircleHelp className="size-5" aria-hidden />
        </Link>
        <Notifications />
        <div className="hidden sm:block lg:hidden">
          <UserMenu compact placement="header" />
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
