import { X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useThemeEffect } from '../../state/hooks.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { useSession } from '../../state/session.js';
import { useAutoWatch } from '../../state/useAutoWatch.js';
import { dismissLoadIssue, useStoreStatus } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { Notice, PageSkeleton } from '../ui/States.js';
import { RouteErrorBoundary } from './RouteErrorBoundary.js';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

const COLLAPSE_KEY = 'fundtrace.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell(): React.JSX.Element {
  const session = useSession();
  const cloudAuth = useCloudAuth();
  const location = useLocation();
  const status = useStoreStatus();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  useThemeEffect();
  useAutoWatch(session?.name ?? null);

  // Close the mobile drawer whenever the route changes (derived during render, not in an effect).
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setDrawer(false);
  }

  // Firebase restores a previous sign-in asynchronously: wait for it instead of flashing the login page.
  if (session === null && cloudAuth.status === 'loading') {
    return (
      <div className="p-8">
        <PageSkeleton />
      </div>
    );
  }

  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const toggle = (): void => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // preference is non-essential
      }
      return !c;
    });
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="bg-primary sr-only z-[200] rounded-lg px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <aside
        className={cn(
          'no-print border-line bg-surface fixed inset-y-0 left-0 z-40 hidden border-r lg:block',
          collapsed ? 'w-[76px]' : 'w-[244px]',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      </aside>
      {drawer && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="bg-navy-deep/50 absolute inset-0"
            onClick={() => {
              setDrawer(false);
            }}
          />
          <div className="bg-surface absolute inset-y-0 left-0 w-[280px] max-w-[85vw]">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => {
                setDrawer(false);
              }}
              className="text-muted hover:text-ink absolute top-4 right-3 z-10 rounded-lg p-1.5"
            >
              <X className="size-5" aria-hidden />
            </button>
            <Sidebar
              collapsed={false}
              mobile
              onNavigate={() => {
                setDrawer(false);
              }}
            />
          </div>
        </div>
      )}
      <div className={cn('flex min-h-dvh flex-col', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[244px]')}>
        <Topbar
          onOpenMenu={() => {
            setDrawer(true);
          }}
        />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          {status.loadIssue !== null && (
            <div className="mb-4 flex items-start gap-2">
              <Notice tone="warn" className="flex-1">
                {status.loadIssue}
              </Notice>
              <button
                type="button"
                className="text-muted hover:text-ink rounded p-1 text-xs"
                onClick={dismissLoadIssue}
              >
                Dismiss
              </button>
            </div>
          )}
          {status.saveError !== null && (
            <Notice tone="danger" className="mb-4">
              {status.saveError}
            </Notice>
          )}
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
        <footer className="no-print text-muted border-line border-t px-6 py-3 text-xs">
          FundTrace AI prototype · All records are synthetic demo data · Alerts are investigative
          leads, not fraud determinations.
        </footer>
      </div>
    </div>
  );
}
