import { CircleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { PRIORITY_LABEL } from '../../domain/labels.js';
import type { Count } from '../../lib/nav-counts.js';
import { cn } from '../ui/cn.js';
import type { NavItem, Stage } from './nav.js';

export const STAGE_TEXT: Record<Stage | 'none', string> = {
  pre: 'text-rail-pre',
  post: 'text-rail-post',
  investigate: 'text-rail-investigate',
  none: 'text-rail-post',
};
export const STAGE_BG: Record<Stage | 'none', string> = {
  pre: 'bg-rail-pre',
  post: 'bg-rail-post',
  investigate: 'bg-rail-investigate',
  none: 'bg-rail-post',
};

/** What a screen reader hears after the label, e.g. ", 6 open, highest Urgent review". */
export function countText(count: Count | undefined): string {
  if (count === undefined || count.value === 0) return '';
  return `, ${count.value} open${count.top === null ? '' : `, highest ${PRIORITY_LABEL[count.top]}`}`;
}

/** Count badge: red with an icon when an item is Urgent review, amber for Needs attention. */
export function CountPill({
  count,
  floating = false,
}: {
  count: Count;
  floating?: boolean;
}): React.JSX.Element | null {
  if (count.value === 0) return null;
  return (
    <span
      key={count.value}
      aria-hidden
      className={cn(
        'count-pop tabular inline-flex items-center justify-center gap-0.5 rounded-full font-bold',
        count.top === 'urgent'
          ? 'bg-rail-urgent text-navy-deep'
          : count.top === 'needs_attention'
            ? 'bg-rail-attention text-navy-deep'
            : 'bg-white/15 text-white',
        floating
          ? 'ring-rail absolute -top-2.5 -right-3 min-w-[16px] px-1 text-[9.5px] leading-[15px] ring-2'
          : 'min-w-[20px] px-1.5 text-[11px] leading-[18px]',
      )}
    >
      {count.top === 'urgent' && !floating && <CircleAlert className="size-3" aria-hidden />}
      {count.value > 99 ? '99+' : count.value}
    </span>
  );
}

export function RailTag({ children }: { children: string }): React.JSX.Element {
  return (
    <span className="rounded border border-white/20 px-1 py-px text-[9px] font-semibold tracking-wide text-white/75 uppercase">
      {children}
    </span>
  );
}

export interface HintTarget {
  label: string;
  detail: string;
  top: number;
}

/** One sidebar link. In the journey sections it sits on the vertical line as a "station". */
export function SidebarItem({
  item,
  stage,
  count,
  active,
  collapsed,
  onJourney,
  onNavigate,
  onHint,
}: {
  item: NavItem;
  stage: Stage | 'none';
  count: Count | undefined;
  active: boolean;
  collapsed: boolean;
  onJourney: boolean;
  onNavigate: (() => void) | undefined;
  onHint: (hint: HintTarget | null) => void;
}): React.JSX.Element {
  const Icon = item.icon;
  const showHint = (el: HTMLElement): void => {
    if (!collapsed) return;
    const r = el.getBoundingClientRect();
    const shortcut = item.key === undefined ? '' : `G ${item.key.toUpperCase()}`;
    const open = count !== undefined && count.value > 0 ? `${count.value} open` : '';
    onHint({
      label: item.label,
      detail: [open, shortcut].filter(Boolean).join(' · '),
      top: r.top + r.height / 2,
    });
  };
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      onMouseEnter={(e) => {
        showHint(e.currentTarget);
      }}
      onFocus={(e) => {
        showHint(e.currentTarget);
      }}
      onMouseLeave={() => {
        onHint(null);
      }}
      onBlur={() => {
        onHint(null);
      }}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] font-medium transition-colors duration-150',
        collapsed ? 'mx-auto size-10 justify-center px-0' : 'px-2',
        onJourney && !collapsed && 'ml-[28px]',
        active
          ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]'
          : 'text-rail-muted hover:bg-white/[0.05] hover:text-white',
      )}
    >
      {onJourney && !collapsed && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 -translate-y-1/2 rounded-full transition-all',
            active
              ? cn('-left-[12px] size-2.5 ring-4 ring-white/10', STAGE_BG[stage])
              : '-left-[10px] size-1.5 bg-white/25 group-hover:bg-white/50',
          )}
        />
      )}
      {active && !onJourney && !collapsed && (
        <span
          aria-hidden
          className={cn('absolute inset-y-1.5 -left-3 w-[3px] rounded-r', STAGE_BG[stage])}
        />
      )}
      <span className="relative">
        <Icon
          className={cn(
            'size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110',
            active ? STAGE_TEXT[stage] : 'text-rail-muted group-hover:text-white',
          )}
          aria-hidden
        />
        {collapsed && count !== undefined && <CountPill count={count} floating />}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>
        {item.label}
        {item.tag !== undefined && <span className="sr-only"> ({item.tag})</span>}
        <span className="sr-only">{countText(count)}</span>
      </span>
      {!collapsed && item.tag !== undefined && <RailTag>{item.tag}</RailTag>}
      {!collapsed && count !== undefined && <CountPill count={count} />}
    </Link>
  );
}
