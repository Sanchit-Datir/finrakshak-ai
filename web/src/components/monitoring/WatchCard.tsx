import { BellRing, CircleCheck, Search } from 'lucide-react';
import { useState } from 'react';
import type { PublicWatch } from '../../domain/schemas.js';
import { formatMoney } from '../../lib/format.js';
import { loadPublicRecords } from '../../lib/public-records.js';
import { checkWatch } from '../../lib/public-watch.js';
import { recordWatchCheck } from '../../state/actions.js';
import { useFormat } from '../../state/hooks.js';
import { useToast } from '../../state/toast.js';
import { Badge } from '../ui/Badge.js';
import { Button, LinkButton } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { cn } from '../ui/cn.js';
import { TextField } from '../ui/Field.js';
import { ErrorState, Skeleton } from '../ui/States.js';
import { WatchTimeline } from './WatchTimeline.js';

type Run = { status: 'idle' } | { status: 'loading' } | { status: 'error' };

const MATCH: Record<string, string> = {
  cin: 'Matched by CIN',
  exact_name: 'Matched by exact name — confirm CIN',
  ambiguous: 'Several records share this name — add the CIN',
  none: 'Not found in public records',
  via_applicant_record: 'Found in public records',
};

const today = (): string => new Date().toISOString().slice(0, 10);

/** One watched loan: run a check as of a date, see the alerts it raised and the timeline. */
export function WatchCard({
  watch,
  actor,
  highlighted,
}: {
  watch: PublicWatch;
  actor: string;
  highlighted: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const toast = useToast();
  const [asOf, setAsOf] = useState(today);
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const s = watch.lastCheck?.subject;

  const check = async (): Promise<void> => {
    setRun({ status: 'loading' });
    try {
      const ix = await loadPublicRecords();
      const result = checkWatch(ix, watch, asOf, new Date().toISOString());
      recordWatchCheck(watch.id, actor, {
        ...result,
        datasetBuiltAt: ix.bundle.meta.dataset_built_at,
      });
      setRun({ status: 'idle' });
      const n = result.newEvents.length;
      toast.push({
        tone: n > 0 ? 'info' : 'success',
        title: n > 0 ? `${n} new public record(s) — alert(s) raised` : 'No new public records',
        detail: `${watch.loanRef} checked as of ${asOf}.`,
      });
    } catch (e: unknown) {
      console.warn('Watch check failed:', e instanceof Error ? e.message : 'unknown error');
      setRun({ status: 'error' });
    }
  };

  return (
    <section aria-label={`Watch ${watch.loanRef}`}>
      <Card className={cn(highlighted && 'ring-primary ring-2')}>
        <CardHeader
          title={`${watch.borrowerName} · ${watch.loanRef}`}
          subtitle={`Disbursed ${f.date(watch.disbursedOn)}${watch.amountMinor === null ? '' : ` · ${formatMoney(watch.amountMinor)}`}${watch.cin === '' ? '' : ` · CIN ${watch.cin}`}`}
          actions={
            watch.events.length > 0 ? (
              <Badge tone="danger" icon={BellRing}>
                {watch.events.length} alert(s) raised
              </Badge>
            ) : (
              <Badge tone="ok" icon={CircleCheck}>
                No alerts
              </Badge>
            )
          }
        />
        <div className="space-y-4 px-5 pb-5">
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Check as of"
              type="date"
              value={asOf}
              max={today()}
              onChange={(e) => {
                setAsOf(e.target.value);
              }}
              className="w-48"
            />
            <Button
              variant="primary"
              icon={Search}
              loading={run.status === 'loading'}
              disabled={asOf === ''}
              onClick={() => {
                void check();
              }}
            >
              Check now
            </Button>
            {watch.events.length > 0 && (
              <LinkButton to="/alerts?source=public_records">Open in Alerts</LinkButton>
            )}
          </div>
          {watch.lastCheck !== null && s !== undefined && (
            <p className="text-muted text-xs">
              Last checked {f.dateTime(watch.lastCheck.checkedAt)} as of{' '}
              {f.date(watch.lastCheck.asOf)} · {MATCH[s.match] ?? s.match}
              {s.matchedName !== null && ` → ${s.matchedName}`}
              {s.mcaStatus !== null && ` · MCA status: ${s.mcaStatus}`} · dataset built{' '}
              {watch.lastCheck.datasetBuiltAt === null
                ? 'unknown'
                : f.date(watch.lastCheck.datasetBuiltAt)}
            </p>
          )}
          {run.status === 'loading' && (
            <div aria-busy="true" aria-live="polite">
              <p className="text-muted text-sm">Loading the public-records dataset…</p>
              <Skeleton className="mt-2 h-16 w-full" />
            </div>
          )}
          {run.status === 'error' && (
            <ErrorState
              title="Could not check public records"
              onRetry={() => {
                void check();
              }}
            >
              The public-records dataset could not be loaded. When running locally, publish it with{' '}
              <code>node ingest/dist/graphCli.js --web</code>.
            </ErrorState>
          )}
          <WatchTimeline watch={watch} />
        </div>
      </Card>
    </section>
  );
}
