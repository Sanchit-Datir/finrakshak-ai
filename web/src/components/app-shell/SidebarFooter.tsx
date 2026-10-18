import { CircleHelp, Settings, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { Db } from '../../domain/schemas.js';
import { relativeTime } from '../../lib/format.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { cn } from '../ui/cn.js';
import { UserMenu } from './UserMenu.js';

const ICON_LINK =
  'text-rail-muted grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/10 hover:text-white';

/** Latest automatic public-records check across the loan book, or null before the first one. */
function lastPublicCheck(db: Db): string | null {
  let last: string | null = null;
  for (const w of db.publicWatches) {
    const at = w.lastCheck?.checkedAt;
    if (at !== undefined && (last === null || at > last)) last = at;
  }
  return last;
}

/**
 * Shows that the app is live (when public records were last checked, whether a real AI model is
 * connected), then the person, Settings and Help. The AI line never claims a model in a demo session.
 */
export function SidebarFooter({
  db,
  collapsed,
  onNavigate,
}: {
  db: Db;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}): React.JSX.Element {
  const cloud = useCloudAuth();
  const checked = lastPublicCheck(db);
  const aiLive = cloud.status === 'ready';
  return (
    <div className="border-t border-white/10 px-3 pt-2 pb-2.5">
      {!collapsed && (
        <div className="text-rail-muted mb-1.5 space-y-0.5 px-1 text-[11px]">
          <p className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                checked === null ? 'bg-rail-attention' : 'bg-rail-post',
              )}
            />
            <span className="truncate">
              Public records ·{' '}
              {checked === null ? 'not checked yet' : `checked ${relativeTime(checked)}`}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Sparkles
              className={cn('size-3 shrink-0', aiLive ? 'text-rail-post' : 'text-rail-attention')}
              aria-hidden
            />
            <span className="truncate">
              {aiLive ? 'AI · Gemini via secure server' : 'AI · demo session, no model called'}
            </span>
          </p>
        </div>
      )}
      <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
        <div className={cn('min-w-0', !collapsed && 'flex-1')}>
          <UserMenu compact={collapsed} placement="sidebar" inverted />
        </div>
        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className={ICON_LINK}
          onClick={onNavigate}
        >
          <Settings className="size-[17px]" aria-hidden />
        </Link>
        <Link
          to="/help"
          aria-label="Help & Support"
          title="Help & Support"
          className={ICON_LINK}
          onClick={onNavigate}
        >
          <CircleHelp className="size-[17px]" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
