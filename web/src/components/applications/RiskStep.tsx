import { ArrowLeft, CircleCheck, ClipboardCheck, Play, Send } from 'lucide-react';
import { useState } from 'react';
import { PRIORITY_HELP } from '../../domain/labels.js';
import type { Application, Db } from '../../domain/schemas.js';
import { CHECK_NAMES, reviewPriority, runChecks } from '../../lib/checks.js';
import { checkPublicRecords, loadPublicRecords } from '../../lib/public-records.js';
import { publicRecordsInputsKey } from '../../lib/public-records-findings.js';
import { recordChecksRun, recordPublicRecordsCheck } from '../../state/actions.js';
import { useFormat } from '../../state/hooks.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { PriorityBadge } from '../ui/StatusBadges.js';
import { AiAnalysisCard } from './AiAnalysisCard.js';
import { FindingsTable } from './Findings.js';
import { PublicRecordsCheck } from './PublicRecordsCheck.js';

export function RiskStep({
  app,
  db,
  actor,
  onBack,
  onSubmit,
}: {
  app: Application;
  db: Db;
  actor: string;
  onBack: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  const f = useFormat();
  const toast = useToast();
  const [ran, setRan] = useState(app.checksRunAt !== null);
  const findings = runChecks(app, db);
  const priority = reviewPriority(app, db);
  const [running, setRunning] = useState(false);
  // Business applicants: Run checks also runs the public-records check when missing or stale.
  const needsPublicRecords =
    app.data.business.businessName.trim() !== '' &&
    app.publicRecords?.inputsKey !== publicRecordsInputsKey(app.data);
  const runPublicRecords = async (): Promise<boolean> => {
    try {
      const ix = await loadPublicRecords();
      recordPublicRecordsCheck(
        app.id,
        actor,
        checkPublicRecords(ix, app.data, new Date().toISOString()),
      );
      return true;
    } catch (e: unknown) {
      console.warn(
        'Public-records check failed:',
        e instanceof Error ? e.message : 'unknown error',
      );
      toast.push({
        tone: 'error',
        title: 'Public-records check could not run',
        detail:
          'The other checks ran. Publish the dataset (node ingest/dist/graphCli.js --web) and re-run.',
      });
      return false;
    }
  };
  const run = async (): Promise<void> => {
    setRunning(true);
    const withRecords = needsPublicRecords && (await runPublicRecords());
    recordChecksRun(
      app.id,
      actor,
      `${CHECK_NAMES.length} deterministic checks${withRecords ? ' incl. public-records check' : ''}`,
    );
    setRan(true);
    setRunning(false);
    toast.push({
      tone: 'success',
      title: 'Checks completed',
      detail: `Findings updated${withRecords ? ', including the public-records check' : ''}.`,
    });
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ClipboardCheck className="text-teal size-5" aria-hidden /> Configured checks
              </span>
            }
            subtitle="Deterministic rules that run in your browser on this application’s saved data and reviewed document fields."
          />
          <ul className="grid grid-cols-1 gap-1 px-5 pb-4 text-sm sm:grid-cols-2">
            {CHECK_NAMES.map((n) => (
              <li key={n} className="flex items-center gap-2">
                <CircleCheck className={ran ? 'text-ok size-4' : 'text-line size-4'} aria-hidden />
                {n}
                <span className="sr-only">{ran ? '(ran)' : '(not run)'}</span>
              </li>
            ))}
          </ul>
          <div className="border-line flex flex-wrap items-center gap-3 border-t px-5 py-3">
            <Button
              variant="primary"
              icon={Play}
              loading={running}
              onClick={() => {
                void run();
              }}
            >
              {ran ? 'Re-run checks' : 'Run checks'}
            </Button>
            {app.checksRunAt !== null && (
              <span className="text-muted text-xs">Last run {f.dateTime(app.checksRunAt)}</span>
            )}
          </div>
        </Card>
        <AiAnalysisCard app={app} db={db} actor={actor} findings={ran ? findings : []} />
      </div>

      <PublicRecordsCheck app={app} actor={actor} />

      {ran && (
        <>
          <Card>
            <CardHeader
              title="Review priority"
              actions={<PriorityBadge priority={priority} />}
              subtitle={priority === null ? 'Run checks to calculate.' : PRIORITY_HELP[priority]}
            />
            <p className="text-muted px-5 pb-4 text-xs">
              Priority is the highest priority among unresolved findings. It is a label for triage,
              not a score or probability.
            </p>
          </Card>
          <Card>
            <CardHeader
              title="Findings"
              subtitle="Select a finding to see evidence, benign explanations and verification steps."
            />
            <FindingsTable app={app} findings={findings} actor={actor} />
          </Card>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button icon={ArrowLeft} onClick={onBack}>
          Previous step
        </Button>
        <Button
          variant="primary"
          icon={Send}
          className="ml-auto"
          disabled={!ran}
          onClick={onSubmit}
          title={ran ? undefined : 'Run checks first'}
        >
          Submit for review
        </Button>
      </div>
    </div>
  );
}
