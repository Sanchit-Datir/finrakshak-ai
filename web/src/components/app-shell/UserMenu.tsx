import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROLE_LABEL } from '../../domain/labels.js';
import { initials } from '../../lib/format.js';
import { useSession } from '../../state/session.js';
import { useSignOut } from '../../state/useSignOut.js';
import { useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { Popover } from '../ui/Popover.js';

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-navy flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({
  compact = false,
  placement,
  inverted = false,
}: {
  compact?: boolean;
  placement: 'sidebar' | 'header';
  /** On the dark sidebar. */
  inverted?: boolean;
}): React.JSX.Element | null {
  const session = useSession();
  const db = useDb();
  const navigate = useNavigate();
  const signOut = useSignOut();
  if (session === null) return null;
  const branch = db.branches.find((b) => b.id === session.branchId)?.name ?? '';
  return (
    <Popover
      align={placement === 'sidebar' ? 'left' : 'right'}
      panelClassName={cn('text-ink w-64', placement === 'sidebar' && 'top-auto bottom-full mb-2')}
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Profile menu for ${session.name}`}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left',
            inverted ? 'hover:bg-white/10' : 'hover:bg-surface-2',
            compact && 'justify-center',
          )}
        >
          <Avatar
            name={session.name}
            className={
              inverted ? 'from-rail-pre to-rail-investigate text-navy-deep bg-gradient-to-br' : ''
            }
          />
          {!compact && (
            <span className="min-w-0 flex-1 leading-tight">
              <span
                className={cn('block truncate text-sm font-semibold', inverted && 'text-white')}
              >
                {session.name}
              </span>
              <span
                className={cn(
                  'block truncate text-xs',
                  inverted ? 'text-rail-muted' : 'text-muted',
                )}
              >
                {ROLE_LABEL[session.role]} · {branch}
              </span>
            </span>
          )}
          {!compact && (
            <ChevronDown
              className={cn('size-4', inverted ? 'text-rail-muted' : 'text-muted')}
              aria-hidden
            />
          )}
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
            <p className="text-muted text-xs">{db.bankName}</p>
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
              signOut();
            }}
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </Popover>
  );
}
