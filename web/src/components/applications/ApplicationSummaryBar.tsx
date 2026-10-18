import { CircleCheck, Clock3, FileWarning, ListChecks, ScanSearch } from 'lucide-react';
import type { Application, Db, Priority } from '../../domain/schemas.js';
import { applicationDocs } from '../../lib/checks.js';
import { relativeTime } from '../../lib/format.js';
import { cn } from '../ui/cn.js';
import { PriorityBadge } from '../ui/StatusBadges.js';

export type SummaryTarget = 'overview' | 'documents' | 'findings' | 'activity';

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  onClick,
  children,
}: {
  icon: typeof ListChecks;
  label: string;
  value: string;
  tone?: 'neutral' | 'warn' | 'ok';
  onClick: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-surface-2 flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'warn' && 'bg-warn-soft text-warn',
          tone === 'ok' && 'bg-ok-soft text-ok',
          tone === 'neutral' && 'bg-neutral-soft text-neutral',
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="text-muted block text-[11px] font-medium tracking-wide uppercase">
          {label}
        </span>
        <span className="tabular block truncate text-sm font-semibold">{value}</span>
        {children}
      </span>
    </button>
  );
}

/** Sticky at-a-glance strip: priority, open findings, missing documents, review progress. */
export function ApplicationSummaryBar({
  app,
  db,
  priority,
  openFindings,
  onGo,
}: {
  app: Application;
  db: Db;
  priority: Priority | null;
  openFindings: number;
  onGo: (t: SummaryTarget) => void;
}): React.JSX.Element {
  const docs = applicationDocs(app, db);
  const missing = db.settings.checklists[app.data.loan.product].filter(
    (t) => !docs.some((d) => d.docType === t && d.processing !== 'failed'),
  ).length;
  const fields = docs.flatMap((d) => d.fields);
  const reviewed = fields.filter((x) => x.state !== 'unreviewed').length;
  const pct = fields.length === 0 ? 100 : Math.round((reviewed / fields.length) * 100);
  return (
    <div className="bg-surface/90 border-line sticky top-16 z-20 -mx-1 mb-5 grid grid-cols-2 gap-1 rounded-2xl border p-1.5 shadow-[var(--shadow-card)] backdrop-blur-md md:grid-cols-5">
      <button
        type="button"
        onClick={() => {
          onGo('findings');
        }}
        className="hover:bg-surface-2 flex flex-col items-start justify-center gap-1 rounded-xl px-3 py-2 text-left"
      >
        <span className="text-muted text-[11px] font-medium tracking-wide uppercase">
          Review priority
        </span>
        <PriorityBadge priority={priority} />
      </button>
      <Stat
        icon={ListChecks}
        label="Open findings"
        value={app.checksRunAt === null ? 'Checks not run' : String(openFindings)}
        tone={openFindings > 0 ? 'warn' : 'ok'}
        onClick={() => {
          onGo('findings');
        }}
      />
      <Stat
        icon={missing > 0 ? FileWarning : CircleCheck}
        label="Missing documents"
        value={missing === 0 ? 'None' : String(missing)}
        tone={missing > 0 ? 'warn' : 'ok'}
        onClick={() => {
          onGo('documents');
        }}
      />
      <Stat
        icon={ScanSearch}
        label="Fields reviewed"
        value={fields.length === 0 ? 'No fields' : `${reviewed}/${fields.length} · ${pct}%`}
        tone={pct === 100 ? 'ok' : 'neutral'}
        onClick={() => {
          onGo('documents');
        }}
      >
        <span className="bg-surface-2 mt-1 block h-1.5 w-24 overflow-hidden rounded-full">
          <span
            className={cn('grow-x block h-full rounded-full', pct === 100 ? 'bg-ok' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </span>
      </Stat>
      <Stat
        icon={Clock3}
        label="Checks last run"
        value={app.checksRunAt === null ? 'Not yet' : relativeTime(app.checksRunAt)}
        onClick={() => {
          onGo('activity');
        }}
      />
    </div>
  );
}
