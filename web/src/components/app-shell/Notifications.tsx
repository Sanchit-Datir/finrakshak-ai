import { Bell } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { PRIORITY_LABEL } from '../../domain/labels.js';
import { allAlerts } from '../../lib/alerts.js';
import { relativeTime } from '../../lib/format.js';
import { mutate, useDb } from '../../state/store.js';
import { cn } from '../ui/cn.js';
import { Popover } from '../ui/Popover.js';

export function Notifications(): React.JSX.Element {
  const db = useDb();
  const fresh = useMemo(() => allAlerts(db).filter((a) => a.status === 'new'), [db]);
  const unread = fresh.filter((a) => !db.readAlertIds.includes(a.id));
  const markAll = (): void => {
    mutate((d) => {
      d.readAlertIds = [...new Set([...d.readAlertIds, ...fresh.map((a) => a.id)])];
    });
  };
  return (
    <Popover
      panelClassName="w-[min(380px,calc(100vw-24px))]"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Notifications: ${unread.length} unread`}
          className="text-muted hover:text-ink hover:bg-surface-2 relative inline-flex size-10 items-center justify-center rounded-lg"
        >
          <Bell className="size-5" aria-hidden />
          {unread.length > 0 && (
            <span className="bg-danger tabular absolute top-1.5 right-1.5 min-w-[18px] rounded-full px-1 text-center text-[10px] leading-[18px] font-bold text-white dark:text-navy-deep">
              {unread.length}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">New alerts</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-primary text-xs font-semibold hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          {fresh.length === 0 ? (
            <p className="text-muted px-4 py-6 text-center text-sm">No new alerts.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {fresh.slice(0, 8).map((a) => {
                const isUnread = !db.readAlertIds.includes(a.id);
                return (
                  <li key={a.id} className="border-line border-b last:border-b-0">
                    <Link
                      to={`/alerts?alert=${encodeURIComponent(a.id)}`}
                      onClick={close}
                      className="hover:bg-surface-2 flex gap-3 px-4 py-3"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          isUnread ? 'bg-primary' : 'bg-transparent',
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{a.title}</span>
                        <span className="text-muted block text-xs">
                          {PRIORITY_LABEL[a.priority]} · {a.linkedLabel} · {relativeTime(a.at)}
                          {isUnread && <span className="sr-only"> (unread)</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/alerts"
            onClick={close}
            className="text-primary block border-t border-line px-4 py-2.5 text-center text-sm font-semibold hover:underline"
          >
            View all alerts
          </Link>
        </div>
      )}
    </Popover>
  );
}
