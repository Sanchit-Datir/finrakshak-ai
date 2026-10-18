import { CircleHelp, Menu, Moon, Plus, Search, Sparkles, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { useDb } from '../../state/store.js';
import { effectiveTheme, toggleTheme } from '../../state/theme.js';
import { LinkButton } from '../ui/Button.js';
import { LogoMark } from './Logo.js';
import { Notifications } from './Notifications.js';
import { SignOutButton } from './SignOutButton.js';
import { UserMenu } from './UserMenu.js';
import { openCopilot } from '../../state/copilot.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

const ICON_BTN =
  'text-muted hover:text-ink hover:bg-surface-2 inline-flex size-10 items-center justify-center rounded-lg transition-colors';

export function Topbar({
  onOpenMenu,
  onOpenPalette,
}: {
  onOpenMenu: () => void;
  onOpenPalette: () => void;
}): React.JSX.Element {
  const theme = useDb().settings.preferences.theme;
  const dark = effectiveTheme(theme) === 'dark';
  return (
    <header className="no-print border-line bg-surface/85 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur-md sm:gap-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className={`${ICON_BTN} lg:hidden`}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <Link to="/dashboard" className="lg:hidden" aria-label="FinRakshak AI dashboard">
        <LogoMark />
      </Link>
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search or jump to (Ctrl K)"
        className="border-line bg-surface-2 text-muted hover:border-primary/50 hover:text-ink group flex h-10 max-w-xl min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 text-sm transition-colors"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Search borrowers, loans, alerts, cases…</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex" aria-hidden>
          <kbd className="border-line bg-surface rounded border px-1.5 font-sans text-[11px] font-semibold">
            {isMac ? '⌘' : 'Ctrl'}
          </kbd>
          <kbd className="border-line bg-surface rounded border px-1.5 font-sans text-[11px] font-semibold">
            K
          </kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={openCopilot}
          aria-label={`Ask FinRakshak Copilot (${isMac ? '⌘' : 'Ctrl'} J)`}
          title={`Ask FinRakshak Copilot (${isMac ? '⌘' : 'Ctrl'} J)`}
          className="from-primary to-violet dark:text-navy-deep inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r px-3 text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-[filter] hover:brightness-110"
        >
          <Sparkles className="size-4" aria-hidden />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
        <div className="hidden md:block">
          <LinkButton to="/applications/new" variant="primary" icon={Plus}>
            New application
          </LinkButton>
        </div>
        <button
          type="button"
          onClick={() => {
            toggleTheme(theme);
          }}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
          className={ICON_BTN}
        >
          {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
        </button>
        <Link
          to="/help"
          aria-label="Help & Support"
          title="Help"
          className={`${ICON_BTN} hidden sm:inline-flex`}
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
