import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { navCounts, type NavCounts } from '../../lib/nav-counts.js';
import { useBranchScope } from '../../state/scope.js';
import { useSession } from '../../state/session.js';
import { useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { LoanBookCheckpoint } from './LoanBookCheckpoint.js';
import { Wordmark } from './Logo.js';
import { NAV_SECTIONS, activeNavPath, type NavSection } from './nav.js';
import { PinnedList } from './PinnedList.js';
import { ScopeSwitcher } from './ScopeSwitcher.js';
import { SidebarFooter } from './SidebarFooter.js';
import { STAGE_TEXT, SidebarItem, type HintTarget } from './SidebarItem.js';

const RING: Record<NonNullable<NavSection['stage']>['kind'], string> = {
  pre: 'ring-rail-pre',
  post: 'ring-rail-post',
  investigate: 'ring-rail-investigate',
};

/** One-line status beside each journey step, e.g. "6 in review". */
function stageMeta(id: string, c: NavCounts): string {
  if (id === 'pre') return c.applications.value > 0 ? `${c.applications.value} in review` : '';
  if (id === 'post') return c.loans.value > 0 ? `${c.loans.value} flagged` : 'all clear';
  if (id === 'investigate') return c.cases.value > 0 ? `${c.cases.value} open` : '';
  return '';
}

function SectionHeader({
  section,
  meta,
  collapsed,
}: {
  section: NavSection;
  meta: string;
  collapsed: boolean;
}): React.JSX.Element | null {
  const stage = section.stage;
  if (stage === undefined) {
    if (section.bare === true && !collapsed) return null;
    return collapsed ? (
      <div aria-hidden className="mx-4 my-2 border-t border-white/10" />
    ) : (
      <p className="text-rail-muted mb-1 px-2.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
        {section.label}
      </p>
    );
  }
  const node = (
    <span
      aria-hidden
      className={cn(
        'bg-rail relative z-10 grid size-[22px] shrink-0 place-items-center rounded-full text-[11px] font-bold ring-2',
        RING[stage.kind],
        STAGE_TEXT[stage.kind],
      )}
    >
      {stage.n}
    </span>
  );
  if (collapsed) return <div className="my-2 flex justify-center">{node}</div>;
  return (
    <div className="flex h-7 items-center gap-2.5 pr-2 pl-[10px]" title={section.hint}>
      {node}
      <span className="text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-white/90 uppercase">
        {section.label}
      </span>
      {meta !== '' && (
        <span className="text-rail-muted ml-auto text-[11px] whitespace-nowrap">{meta}</span>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}): React.JSX.Element {
  const db = useDb();
  const session = useSession();
  const location = useLocation();
  const { scope } = useBranchScope();
  const [hint, setHint] = useState<HintTarget | null>(null);
  const active = activeNavPath(location.pathname);
  const counts = navCounts(db, session?.name ?? '', scope);

  const renderSection = (section: NavSection): React.JSX.Element => (
    <div key={section.id} className={cn(section.stage === undefined && 'mt-3 first:mt-0')}>
      <SectionHeader section={section} meta={stageMeta(section.id, counts)} collapsed={collapsed} />
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <SidebarItem
            key={item.to}
            item={item}
            stage={section.stage?.kind ?? 'none'}
            count={item.count === undefined ? undefined : counts[item.count]}
            active={active === item.to}
            collapsed={collapsed}
            onJourney={section.stage !== undefined}
            onNavigate={onNavigate}
            onHint={setHint}
          />
        ))}
      </div>
    </div>
  );

  const journey = NAV_SECTIONS.filter((s) => s.stage !== undefined);
  const [workspace, ...rest] = NAV_SECTIONS.filter((s) => s.stage === undefined);

  return (
    <div className="rail-surface flex h-full flex-col">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Wordmark collapsed={collapsed} inverted />
        {!mobile && !collapsed && onToggleCollapse !== undefined && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="text-rail-muted rounded-lg p-1.5 hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose className="size-[18px]" aria-hidden />
          </button>
        )}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <ScopeSwitcher collapsed={collapsed} urgentElsewhere={counts.urgentElsewhere} />
      </div>
      <nav
        aria-label="Main"
        className="rail-scroll flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3"
      >
        {workspace !== undefined && renderSection(workspace)}
        <div
          className={cn(
            'relative mt-3',
            !collapsed &&
              'before:from-rail-pre before:via-rail-post before:to-rail-investigate before:absolute before:top-[14px] before:bottom-[16px] before:left-[20px] before:w-0.5 before:rounded-full before:bg-gradient-to-b before:opacity-40',
          )}
        >
          {journey.map((section) => (
            <div key={section.id}>
              {renderSection(section)}
              {section.id === 'pre' && (
                <LoanBookCheckpoint
                  pulse={counts.pulse}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
              {section.id === 'post' && <div className="h-2" />}
            </div>
          ))}
        </div>
        {rest.map(renderSection)}
        {!collapsed && <PinnedList onNavigate={onNavigate} />}
      </nav>
      {collapsed && onToggleCollapse !== undefined && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="text-rail-muted mx-auto mb-1 grid size-9 place-items-center rounded-lg hover:bg-white/10 hover:text-white"
        >
          <PanelLeftOpen className="size-[18px]" aria-hidden />
        </button>
      )}
      <SidebarFooter db={db} collapsed={collapsed} onNavigate={onNavigate} />
      {hint !== null && collapsed && (
        <div
          aria-hidden
          className="bg-navy-deep pointer-events-none fixed left-[84px] z-50 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap text-white shadow-[var(--shadow-pop)] ring-1 ring-white/10"
          style={{ top: hint.top }}
        >
          <span className="font-semibold">{hint.label}</span>
          {hint.detail !== '' && <span className="text-rail-muted"> · {hint.detail}</span>}
        </div>
      )}
    </div>
  );
}
