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
import { useGlobalHotkeys } from '../../state/useHotkeys.js';
import { CommandPalette } from '../command/CommandPalette.js';
import { CopilotPanel } from '../copilot/CopilotPanel.js';
import { openCopilot } from '../../state/copilot.js';
import { ShortcutsDialog } from '../command/ShortcutsDialog.js';
import { Breadcrumbs } from './Breadcrumbs.js';
import { MobileTabBar } from './MobileTabBar.js';
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
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  useThemeEffect();
  useGlobalHotkeys({
    palette: () => {
      setPalette(true);
    },
    shortcuts: () => {
      setShortcuts(true);
    },
    copilot: openCopilot,
  });
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
          'no-print fixed inset-y-0 left-0 z-40 hidden border-r border-white/5 lg:block',
          collapsed ? 'w-[76px]' : 'w-[264px]',
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
          <div className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw]">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => {
                setDrawer(false);
              }}
              className="text-rail-muted absolute top-4 right-3 z-10 rounded-lg p-1.5 hover:bg-white/10 hover:text-white"
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
      <div className={cn('flex min-h-dvh flex-col', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]')}>
        <Topbar
          onOpenMenu={() => {
            setDrawer(true);
          }}
          onOpenPalette={() => {
            setPalette(true);
          }}
        />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 lg:px-8 lg:pb-6"
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
          <Breadcrumbs />
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <div key={location.pathname} className="page-enter">
                <Outlet />
              </div>
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
      <MobileTabBar
        onMore={() => {
          setDrawer(true);
        }}
      />
      <CommandPalette
        open={palette}
        onClose={() => {
          setPalette(false);
        }}
        onShortcuts={() => {
          setShortcuts(true);
        }}
      />
      <CopilotPanel />
      <ShortcutsDialog
        open={shortcuts}
        onClose={() => {
          setShortcuts(false);
        }}
      />
    </div>
  );
}
