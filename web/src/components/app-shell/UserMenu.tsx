import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROLE_LABEL } from '../../domain/labels.js';
import { initials } from '../../lib/format.js';
import { endSession, useSession } from '../../state/session.js';
import { useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { Popover } from '../ui/Popover.js';

export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-navy flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs',
      )}
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({
  compact = false,
  placement,
}: {
  compact?: boolean;
  placement: 'sidebar' | 'header';
}): React.JSX.Element | null {
  const session = useSession();
  const db = useDb();
  const navigate = useNavigate();
  if (session === null) return null;
  const branch = db.branches.find((b) => b.id === session.branchId)?.name ?? '';
  return (
    <Popover
      align={placement === 'sidebar' ? 'left' : 'right'}
      panelClassName={cn('w-64', placement === 'sidebar' && 'top-auto bottom-full mb-2')}
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Profile menu for ${session.name}`}
          className={cn(
            'hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left',
            compact && 'justify-center',
          )}
        >
          <Avatar name={session.name} />
          {!compact && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{session.name}</span>
              <span className="text-muted block truncate text-xs">
                {ROLE_LABEL[session.role]} · {branch}
              </span>
            </span>
          )}
          {!compact && <ChevronDown className="text-muted size-4" aria-hidden />}
        </button>
      )}
    >
      {(close) => (
        <div className="py-1 text-sm">
          <div className="border-line border-b px-3 py-2.5">
            <p className="font-semibold">{session.name}</p>
            <p className="text-muted text-xs">
              {ROLE_LABEL[session.role]} · {branch}
            </p>
            <p className="text-muted text-xs">{db.bankName} (demo)</p>
          </div>
          <button
            type="button"
            className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2"
            onClick={() => {
              close();
              void navigate('/settings');
            }}
          >
            <UserRound className="size-4" aria-hidden /> Profile
          </button>
          <button
            type="button"
            className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2"
            onClick={() => {
              close();
              void navigate('/settings?tab=preferences');
            }}
          >
            <Settings className="size-4" aria-hidden /> Preferences
          </button>
          <button
            type="button"
            className="hover:bg-surface-2 text-danger flex w-full items-center gap-2 px-3 py-2"
            onClick={() => {
              close();
              endSession();
              void navigate('/login');
            }}
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </Popover>
  );
}
