import { BellRing, FileStack, Inbox, LayoutDashboard, Menu, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { navCounts, type CountKey } from '../../lib/nav-counts.js';
import { useBranchScope } from '../../state/scope.js';
import { useSession } from '../../state/session.js';
import { useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { activeNavPath } from './nav.js';

const TABS: { to: string; label: string; icon: LucideIcon; count?: CountKey }[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/queue', label: 'My queue', icon: Inbox, count: 'queue' },
  { to: '/applications', label: 'Applications', icon: FileStack, count: 'applications' },
  { to: '/alerts', label: 'Alerts', icon: BellRing, count: 'alerts' },
];

const TAB =
  'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium';

/** Thumb-reach navigation for phones; "More" opens the full sidebar drawer. */
export function MobileTabBar({ onMore }: { onMore: () => void }): React.JSX.Element {
  const db = useDb();
  const session = useSession();
  const { scope } = useBranchScope();
  const { pathname } = useLocation();
  const counts = navCounts(db, session?.name ?? '', scope);
  const active = activeNavPath(pathname);
  return (
    <nav
      aria-label="Quick"
      className="no-print border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {TABS.map(({ to, label, icon: Icon, count }) => {
        const n = count === undefined ? 0 : counts[count].value;
        const on = active === to;
        return (
          <Link
            key={to}
            to={to}
            aria-current={on ? 'page' : undefined}
            className={cn(TAB, on ? 'text-primary' : 'text-muted')}
          >
            {on && <span aria-hidden className="bg-primary absolute top-0 h-0.5 w-8 rounded-b" />}
            <span className="relative">
              <Icon className="size-5" aria-hidden />
              {n > 0 && (
                <span
                  aria-hidden
                  className="bg-danger tabular dark:text-navy-deep absolute -top-1.5 -right-2.5 min-w-[16px] rounded-full px-1 text-center text-[9.5px] leading-4 font-bold text-white"
                >
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">
              {label}
              {n > 0 && <span className="sr-only">, {n} open</span>}
            </span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className={cn(TAB, 'text-muted')}>
        <Menu className="size-5" aria-hidden />
        <span>More</span>
      </button>
    </nav>
  );
}
