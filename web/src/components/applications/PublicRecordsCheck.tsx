import { CircleAlert, CircleCheck, Landmark, Search } from 'lucide-react';
import { useState } from 'react';
import type { Application, PrSubject, PublicRecordsSnapshot } from '../../domain/schemas.js';
import { formatMoney } from '../../lib/format.js';
import { checkPublicRecords, isDistressed, loadPublicRecords } from '../../lib/public-records.js';
import { publicRecordsImpact, publicRecordsInputsKey } from '../../lib/public-records-findings.js';
import { recordPublicRecordsCheck } from '../../state/actions.js';
import { useFormat } from '../../state/hooks.js';
import { useToast } from '../../state/toast.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { ErrorState, Notice, Skeleton } from '../ui/States.js';
import { DebtChain } from './DebtChain.js';

type RunState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string };

const MATCH_LABEL: Record<PrSubject['match'], string> = {
  cin: 'Matched by CIN',
  exact_name: 'Matched by exact name — confirm CIN',
  ambiguous: 'Several records share this name — add the CIN',
  none: 'Not found in public records',
  via_applicant_record: "Found through the applicant's own record",
};

function SubjectRow({ s }: { s: PrSubject }): React.JSX.Element {
  const distressed = isDistressed(s);
  return (
    <li className="border-line flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0">
      <span className="min-w-0 font-medium break-words">{s.inputName || s.matchedName}</span>
      {s.matchedName !== null && s.matchedName !== s.inputName && (
        <span className="text-muted text-xs">→ {s.matchedName}</span>
      )}
      <span className="text-muted text-xs">{MATCH_LABEL[s.match]}</span>
      <span className="ml-auto">
        {s.nodeId === null ? (
          <Badge tone="neutral">No record</Badge>
        ) : distressed ? (
          <Badge tone="warn" icon={CircleAlert}>
            {s.mcaStatus ?? `${s.records.length} insolvency / enforcement record(s)`}
          </Badge>
        ) : (
          <Badge tone="ok" icon={CircleCheck}>
            No insolvency or enforcement record
          </Badge>
        )}
      </span>
    </li>
  );
}

function Impact({
  app,
  snap,
}: {
  app: Application;
  snap: PublicRecordsSnapshot;
}): React.JSX.Element | null {
  const impact = publicRecordsImpact(app, snap);
  if (impact === null || impact.totalMinor === 0) return null;
  const rows: [string, string][] = [
    ['Declared receivables', formatMoney(impact.totalMinor)],
    [
      `Owed by customers in insolvency or liquidation (${impact.affectedPercent}%)`,
      formatMoney(impact.affectedMinor),
    ],
    ['Remaining receivables', formatMoney(impact.eligibleMinor)],
  ];
  return (
    <section aria-label="Impact on receivables" className="border-line rounded-lg border p-3">
      <h4 className="text-sm font-semibold">Impact on receivables (drawing power)</h4>
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-surface-2 rounded-lg p-2.5">
            <dt className="text-muted text-xs">{label}</dt>
            <dd className="tabular text-right text-[15px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted mt-2 text-xs">
        Receivables from customers in insolvency or liquidation are usually not counted towards
        drawing power until recovery is evidenced. Ageing and concentration rules still apply to the
        rest.
      </p>
    </section>
  );
}

function Results({
  app,
  snap,
}: {
  app: Application;
  snap: PublicRecordsSnapshot;
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <section aria-label="Who was checked">
        <h4 className="text-sm font-semibold">Checked</h4>
        <ul className="mt-1 text-sm">
          <SubjectRow s={snap.applicant} />
          {snap.customersChecked.map((c, i) => (
            <SubjectRow key={`${c.inputName}-${i}`} s={c} />
          ))}
        </ul>
        {snap.applicant.nodeId === null && (
          <p className="text-muted mt-1 text-xs">
            The applicant is not in the local dataset. Absence of a record is not evidence of good
            standing.
          </p>
        )}
      </section>
      {snap.exposures.length === 0 ? (
        <Notice title="No customer found in insolvency, liquidation or enforcement records">
          Based on the local dataset only. Absence of a record is not evidence of good standing.
        </Notice>
      ) : (
        snap.exposures.map((x) => (
          <section
            key={x.customer.nodeId ?? x.customer.inputName}
            aria-label={`Chain of unpaid dues via ${x.customer.matchedName ?? ''}`}
            className="space-y-2"
          >
            <h4 className="text-sm font-semibold">
              Chain of unpaid dues: {x.chain.length + 1} link(s) below the applicant
            </h4>
            <DebtChain applicant={snap.applicant} exposure={x} />
          </section>
        ))
      )}
      <Impact app={app} snap={snap} />
    </div>
  );
}

/** Runs the applicant and its customers against the local public-records graph. */
export function PublicRecordsCheck({
  app,
  actor,
}: {
  app: Application;
  actor: string;
}): React.JSX.Element {
  const f = useFormat();
  const toast = useToast();
  const [run, setRun] = useState<RunState>({ status: 'idle' });
  const snap = app.publicRecords;
  const hasName = app.data.business.businessName.trim() !== '';
  const stale = snap !== null && snap.inputsKey !== publicRecordsInputsKey(app.data);

  const start = async (): Promise<void> => {
    setRun({ status: 'loading' });
    try {
      const result = checkPublicRecords(
        await loadPublicRecords(),
        app.data,
        new Date().toISOString(),
      );
      recordPublicRecordsCheck(app.id, actor, result);
      setRun({ status: 'idle' });
      toast.push({
        tone: result.exposures.length > 0 ? 'info' : 'success',
        title: 'Public-records check completed',
        detail: `${result.exposures.length} customer(s) in insolvency, liquidation or enforcement records. Re-run checks to update the priority.`,
      });
    } catch (e: unknown) {
      console.warn(
        'Public-records check failed:',
        e instanceof Error ? e.message : 'unknown error',
      );
      setRun({ status: 'error', message: 'The public-records dataset could not be loaded.' });
    }
  };

  return (
    <section aria-label="Public-records check">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Landmark className="text-teal size-5" aria-hidden /> Public-records check
            </span>
          }
          subtitle="Matches the applicant and its customers against public records (IBBI insolvency, MCA company master for Maharashtra, ED, RBI, NFRA, SFIO, SEBI). Not a live registry or credit-bureau lookup."
        />
        <div className="space-y-4 px-5 pb-5">
          {!hasName && (
            <Notice tone="warn">
              Enter the business name (and CIN if known) in Review application to run this check.
            </Notice>
          )}
          {stale && (
            <Notice tone="warn" title="Out of date">
              The business details or customers changed after the last check. Re-run it.
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              icon={Search}
              loading={run.status === 'loading'}
              disabled={!hasName}
              onClick={() => {
                void start();
              }}
            >
              {snap === null ? 'Run public-records check' : 'Re-run public-records check'}
            </Button>
            {snap !== null && (
              <span className="text-muted text-xs">
                Last run {f.dateTime(snap.ranAt)} · dataset built{' '}
                {snap.datasetBuiltAt === null ? 'unknown' : f.date(snap.datasetBuiltAt)}
              </span>
            )}
          </div>
          {run.status === 'loading' && (
            <div aria-busy="true" aria-live="polite" className="space-y-2">
              <p className="text-muted text-sm">Loading the public-records dataset (about 5 MB)…</p>
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {run.status === 'error' && (
            <ErrorState
              title="Could not run the public-records check"
              onRetry={() => {
                void start();
              }}
            >
              {run.message} When running locally, publish it with{' '}
              <code>node ingest/dist/graphCli.js --web</code>.
            </ErrorState>
          )}
          {snap !== null && run.status !== 'loading' && <Results app={app} snap={snap} />}
        </div>
      </Card>
    </section>
  );
}
