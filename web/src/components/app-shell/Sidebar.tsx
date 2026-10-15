import { ChevronDown, CircleHelp, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '../ui/cn.js';
import { Wordmark } from './Logo.js';
import { PRIMARY_NAV, REPORTS_GROUP, SETTINGS_NAV, type NavItem } from './nav.js';
import { UserMenu } from './UserMenu.js';

function Item({
  item,
  collapsed,
  onNavigate,
  nested = false,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  nested?: boolean;
}): React.JSX.Element {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/applications/new'}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          nested && !collapsed && 'pl-9',
          isActive
            ? 'bg-primary-soft text-primary'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden
              className="bg-primary absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r"
            />
          )}
          <Icon className="size-[18px] shrink-0" aria-hidden />
          <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
        </>
      )}
    </NavLink>
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
  const location = useLocation();
  const inGroup = REPORTS_GROUP.items.some((i) => location.pathname.startsWith(i.to));
  const [groupOpen, setGroupOpen] = useState(true);
  const GroupIcon = REPORTS_GROUP.icon;
  const navProps = onNavigate === undefined ? {} : { onNavigate };
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-16 items-center px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Wordmark collapsed={collapsed} />
        {!mobile && !collapsed && onToggleCollapse !== undefined && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="text-muted hover:text-ink hover:bg-surface-2 rounded-lg p-1.5"
          >
            <PanelLeftClose className="size-[18px]" aria-hidden />
          </button>
        )}
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {PRIMARY_NAV.map((item) => (
          <Item key={item.to} item={item} collapsed={collapsed} {...navProps} />
        ))}
        {collapsed ? (
          REPORTS_GROUP.items.map((item) => (
            <Item key={item.to} item={item} collapsed {...navProps} />
          ))
        ) : (
          <div>
            <button
              type="button"
              aria-expanded={groupOpen}
              onClick={() => {
                setGroupOpen((o) => !o);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                inGroup ? 'text-primary' : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              <GroupIcon className="size-[18px] shrink-0" aria-hidden />
              <span className="flex-1 text-left">{REPORTS_GROUP.label}</span>
              <ChevronDown
                className={cn('size-4 transition-transform', groupOpen ? 'rotate-180' : '')}
                aria-hidden
              />
            </button>
            {groupOpen && (
              <div className="mt-1 space-y-1">
                {REPORTS_GROUP.items.map((item) => (
                  <Item key={item.to} item={item} collapsed={false} nested {...navProps} />
                ))}
              </div>
            )}
          </div>
        )}
        <Item item={SETTINGS_NAV} collapsed={collapsed} {...navProps} />
      </nav>
      <div className="border-line space-y-1 border-t px-3 py-3">
        {collapsed && onToggleCollapse !== undefined && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="text-muted hover:text-ink hover:bg-surface-2 flex w-full justify-center rounded-lg p-2"
          >
            <PanelLeftOpen className="size-[18px]" aria-hidden />
          </button>
        )}
        <Item
          item={{ to: '/help', label: 'Help & Support', icon: CircleHelp }}
          collapsed={collapsed}
          {...navProps}
        />
        <UserMenu compact={collapsed} placement="sidebar" />
      </div>
    </div>
  );
}
