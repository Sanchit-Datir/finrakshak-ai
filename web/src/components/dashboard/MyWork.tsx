import { Bell, BriefcaseBusiness, CircleCheckBig, FileStack, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { Application, Case, Db } from '../../domain/schemas.js';
import type { UnifiedAlert } from '../../lib/alerts.js';
import { relativeTime } from '../../lib/format.js';
import { collectWork, type WorkItem } from '../../lib/queue.js';
import { Card, CardHeader } from '../ui/Card.js';
import { PriorityBadge } from '../ui/StatusBadges.js';

const KIND_ICON: Record<WorkItem['kind'], LucideIcon> = {
  Alert: Bell,
  Case: BriefcaseBusiness,
  Application: FileStack,
};
const LIMIT = 7;

/** "What should I do next?" — open items assigned to the signed-in user, most urgent first. */
export function MyWork({
  db,
  me,
  alerts,
  apps,
  cases,
}: {
  db: Db;
  me: string;
  alerts: UnifiedAlert[];
  apps: Application[];
  cases: Case[];
}): React.JSX.Element {
  const items = collectWork(db, me, alerts, apps, cases);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="My work"
        subtitle={
          items.length === 0
            ? 'Nothing assigned to you right now'
            : `${items.length} open item(s) assigned to you or awaiting review`
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 pb-8 text-center">
          <span className="bg-ok-soft text-ok flex size-12 items-center justify-center rounded-full">
            <CircleCheckBig className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">All caught up</p>
          <p className="text-muted max-w-xs text-sm">
            No alerts, cases or applications are waiting on you. New items appear here as they
            arrive.
          </p>
        </div>
      ) : (
        <ul className="divide-line divide-y">
          {items.slice(0, LIMIT).map((it) => {
            const Icon = KIND_ICON[it.kind];
            return (
              <li key={`${it.kind}-${it.id}`}>
                <Link
                  to={it.href}
                  className="hover:bg-surface-2 group flex items-center gap-3 px-4 py-3 transition-colors sm:px-5"
                >
                  <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-primary">
                      {it.title}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {it.kind} · {it.detail}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <PriorityBadge priority={it.priority} />
                  </span>
                  <span className="text-muted tabular hidden w-20 shrink-0 text-right text-xs md:block">
                    {relativeTime(it.at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > LIMIT && (
        <p className="text-muted border-line border-t px-5 py-2.5 text-xs">
          +{items.length - LIMIT} more —{' '}
          <Link to="/queue" className="text-primary font-semibold hover:underline">
            open My queue
          </Link>
        </p>
      )}
    </Card>
  );
}
