import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CircleCheckBig,
  FileStack,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { cn } from '../components/ui/cn.js';
import { Card } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/States.js';
import { PriorityBadge } from '../components/ui/StatusBadges.js';
import { PRIORITY_LABEL } from '../domain/labels.js';
import type { Priority } from '../domain/schemas.js';
import { allAlerts, isOpen } from '../lib/alerts.js';
import { relativeTime } from '../lib/format.js';
import { collectWork, type WorkItem } from '../lib/queue.js';
import { useBranchScope } from '../state/scope.js';
import { useSession } from '../state/session.js';
import { useDb } from '../state/store.js';
import { useUrlState } from '../state/url.js';

const KIND_ICON: Record<WorkItem['kind'], LucideIcon> = {
  Alert: Bell,
  Case: BriefcaseBusiness,
  Application: FileStack,
};
const KINDS = ['all', 'Alert', 'Case', 'Application'] as const;
const KIND_TAB: Record<(typeof KINDS)[number], string> = {
  all: 'Everything',
  Alert: 'Alerts',
  Case: 'Cases',
  Application: 'Applications',
};
const GROUPS: (Priority | null)[] = ['urgent', 'needs_attention', 'routine', null];

/** J / K move between rows (like a mail client); Enter opens the focused row. */
function useRowKeys(container: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))
      )
        return;
      if (document.querySelector('dialog[open]') !== null) return;
      const rows = [
        ...(container.current?.querySelectorAll<HTMLElement>('[data-queue-row]') ?? []),
      ];
      if (rows.length === 0) return;
      const at = rows.findIndex((r) => r === document.activeElement);
      const next = e.key === 'j' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
      e.preventDefault();
      rows[next]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [container]);
}

function Row({ item }: { item: WorkItem }): React.JSX.Element {
  const Icon = KIND_ICON[item.kind];
  return (
    <li>
      <Link
        to={item.href}
        data-queue-row
        className="group hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-primary flex items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5"
      >
        <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="group-hover:text-primary block truncate text-sm font-medium">
            {item.title}
          </span>
          <span className="text-muted block truncate text-xs">
            {item.kind} · {item.detail}
          </span>
        </span>
        <span className="text-muted tabular hidden w-24 shrink-0 text-right text-xs sm:block">
          {relativeTime(item.at)}
        </span>
        <ArrowRight
          className="text-muted group-hover:text-primary size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

export function QueuePage(): React.JSX.Element {
  const db = useDb();
  const session = useSession();
  const { scope } = useBranchScope();
  const [kind, setKind] = useUrlState('kind', 'all');
  const listRef = useRef<HTMLDivElement>(null);
  useRowKeys(listRef);

  const keep = (b: string): boolean => scope === 'all' || b === scope;
  const all = collectWork(
    db,
    session?.name ?? '',
    allAlerts(db).filter((a) => isOpen(a.status) && keep(a.branchId)),
    db.applications.filter((a) => keep(a.branchId)),
    db.cases.filter((c) => keep(c.branchId)),
  );
  const items = kind === 'all' ? all : all.filter((i) => i.kind === kind);

  return (
    <>
      <PageHeader
        docTitle="My queue"
        title="My queue"
        subtitle="Alerts and cases assigned to you, and applications waiting for review: most urgent first."
      />
      <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => {
          const n = k === 'all' ? all.length : all.filter((i) => i.kind === k).length;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
              }}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                kind === k
                  ? 'border-primary bg-primary text-white dark:text-navy-deep'
                  : 'border-line bg-surface text-muted hover:text-ink',
              )}
            >
              {KIND_TAB[k]} <span className="tabular opacity-80">{n}</span>
            </button>
          );
        })}
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={CircleCheckBig} title="All caught up">
            Nothing is waiting on you here. New alerts, cases and applications appear as they
            arrive.
          </EmptyState>
        </Card>
      ) : (
        <div ref={listRef} className="space-y-4">
          {GROUPS.map((p) => {
            const group = items.filter((i) => i.priority === p);
            if (group.length === 0) return null;
            return (
              <Card key={p ?? 'none'} className="overflow-hidden">
                <div className="border-line flex items-center gap-2 border-b px-4 py-2.5 sm:px-5">
                  <PriorityBadge priority={p} />
                  <span className="text-muted text-xs">
                    {group.length} item(s){p === null ? ' without checks' : ''}
                  </span>
                </div>
                <ul
                  aria-label={p === null ? 'Not checked' : PRIORITY_LABEL[p]}
                  className="divide-line divide-y"
                >
                  {group.map((i) => (
                    <Row key={`${i.kind}-${i.id}`} item={i} />
                  ))}
                </ul>
              </Card>
            );
          })}
          <p className="text-muted text-xs">
            Tip: press <kbd className="border-line rounded border px-1">J</kbd> /{' '}
            <kbd className="border-line rounded border px-1">K</kbd> to move between items and{' '}
            <kbd className="border-line rounded border px-1">Enter</kbd> to open one.
          </p>
        </div>
      )}
    </>
  );
}
