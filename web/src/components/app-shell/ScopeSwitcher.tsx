import { Check, ChevronsUpDown, TriangleAlert } from 'lucide-react';
import { allAlerts, isOpen } from '../../lib/alerts.js';
import { useBranchScope } from '../../state/scope.js';
import { useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { Popover } from '../ui/Popover.js';

/** Branch scope for the whole app, in the style of a workspace switcher (B-65). */
export function ScopeSwitcher({
  collapsed,
  urgentElsewhere,
}: {
  collapsed: boolean;
  urgentElsewhere: number;
}): React.JSX.Element {
  const db = useDb();
  const { scope, setScope, locked } = useBranchScope();
  const name =
    scope === 'all' ? 'All branches' : (db.branches.find((b) => b.id === scope)?.name ?? scope);
  const badge = scope === 'all' ? 'ALL' : name.slice(0, 2).toUpperCase();
  const openByBranch = new Map<string, number>();
  for (const a of allAlerts(db)) {
    if (isOpen(a.status)) openByBranch.set(a.branchId, (openByBranch.get(a.branchId) ?? 0) + 1);
  }
  const openTotal = [...openByBranch.values()].reduce((s, n) => s + n, 0);
  const warn = scope !== 'all' && urgentElsewhere > 0;

  const face = (
    <>
      <span className="from-rail-post to-rail-pre text-navy-deep grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-extrabold tracking-wide">
        {badge}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-white">
            {name}
            {locked && <span className="text-rail-muted font-normal"> · your branch</span>}
          </span>
          {warn ? (
            <span className="text-rail-attention flex items-center gap-1 truncate text-[11px] font-medium">
              <TriangleAlert className="size-3 shrink-0" aria-hidden />
              {urgentElsewhere} urgent elsewhere
            </span>
          ) : (
            <span className="text-rail-muted block truncate text-[11px]">{db.bankName}</span>
          )}
        </span>
      )}
    </>
  );

  if (locked) {
    return (
      <div
        className={cn('flex items-center gap-2.5 rounded-xl p-2', !collapsed && 'bg-white/[0.06]')}
      >
        {face}
      </div>
    );
  }

  const option = (
    id: string,
    label: string,
    open: number,
    close: () => void,
  ): React.JSX.Element => (
    <li key={id}>
      <button
        type="button"
        aria-pressed={scope === id}
        onClick={() => {
          setScope(id);
          close();
        }}
        className="hover:bg-surface-2 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm"
      >
        <Check
          className={cn('text-primary size-4', scope === id ? 'opacity-100' : 'opacity-0')}
          aria-hidden
        />
        <span className="flex-1">{label}</span>
        <span className="text-muted tabular text-xs">{open} open</span>
      </button>
    </li>
  );

  return (
    <Popover
      align="left"
      panelClassName="text-ink w-64 py-1"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Branch scope: ${name}${warn ? `. ${urgentElsewhere} urgent elsewhere` : ''}. Change branch`}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors',
            collapsed ? 'justify-center' : 'bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10',
          )}
        >
          {face}
          {!collapsed && <ChevronsUpDown className="text-rail-muted size-4 shrink-0" aria-hidden />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="text-muted px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            Show work for
          </p>
          <ul>
            {option('all', 'All branches', openTotal, close)}
            {db.branches.map((b) => option(b.id, b.name, openByBranch.get(b.id) ?? 0, close))}
          </ul>
          <p className="text-muted border-line border-t px-3 py-2 text-[11px]">
            Lists, counts and the dashboard follow this branch. Urgent items in other branches stay
            flagged here.
          </p>
        </div>
      )}
    </Popover>
  );
}
