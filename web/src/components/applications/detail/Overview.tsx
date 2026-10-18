import { CircleCheck, FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { applicantName } from '../ApplicationsTable.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Card, CardHeader } from '../../ui/Card.js';
import { PriorityBadge } from '../../ui/StatusBadges.js';
import { BORROWER_TYPE_LABEL, PRODUCT_LABEL } from '../../../domain/labels.js';
import type { Application, Db } from '../../../domain/schemas.js';
import { applicationDocs, loanAlertsForApplication, runChecks } from '../../../lib/checks.js';
import { docTypeLabel } from '../../../lib/doc-catalog.js';
import { formatMoney } from '../../../lib/format.js';
import { useFormat } from '../../../state/hooks.js';

export function Overview({
  app,
  db,
  onTab,
}: {
  app: Application;
  db: Db;
  onTab: (t: string) => void;
}): React.JSX.Element {
  const f = useFormat();
  const docs = applicationDocs(app, db);
  const required = db.settings.checklists[app.data.loan.product];
  const findings =
    app.checksRunAt === null
      ? []
      : runChecks(app, db).filter(
          (x) =>
            x.priority !== 'routine' &&
            !['resolved', 'not_an_issue'].includes(app.findingStates[x.id]?.status ?? ''),
        );
  const tasks = docs.flatMap((d) =>
    d.fields
      .filter((x) => x.state === 'unreviewed' || x.state === 'unclear')
      .map((x) => ({ d, x })),
  );
  const loanAlerts = loanAlertsForApplication(app, db);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Summary</h3>
        <dl className="space-y-2 text-sm">
          {[
            ['Applicant', applicantName(app)],
            ['Borrower type', BORROWER_TYPE_LABEL[app.borrowerType]],
            ['Product', PRODUCT_LABEL[app.data.loan.product]],
            ['Requested', formatMoney(app.data.loan.amountMinor)],
            ['Purpose', app.data.loan.purpose || '—'],
            ['Created by', `${app.createdBy}, ${f.date(app.createdAt)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Document checklist</h3>
        <ul className="space-y-1.5 text-sm">
          {required.map((t) => {
            const has = docs.some((d) => d.docType === t && d.processing !== 'failed');
            return (
              <li key={t} className="flex items-center justify-between gap-2">
                <span>{docTypeLabel(t)}</span>
                {has ? (
                  <Badge tone="ok" icon={CircleCheck}>
                    On file
                  </Badge>
                ) : (
                  <Badge tone="warn" icon={FileQuestion}>
                    Missing
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-muted mt-3 text-xs">
          Checklist configured for this product in Settings.
        </p>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Outstanding verification</h3>
        {tasks.length === 0 ? (
          <p className="text-muted text-sm">All extracted fields reviewed.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tasks.slice(0, 6).map(({ d, x }) => (
              <li key={x.id}>
                {x.label}{' '}
                <span className="text-muted">
                  — {d.filename} ({x.state})
                </span>
              </li>
            ))}
          </ul>
        )}
        {tasks.length > 0 && (
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              onTab('documents');
            }}
          >
            Review fields ({tasks.length})
          </Button>
        )}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title="Findings requiring attention"
          actions={
            <Button
              size="sm"
              onClick={() => {
                onTab('findings');
              }}
            >
              All findings
            </Button>
          }
        />
        {findings.length === 0 ? (
          <p className="text-muted px-5 pb-5 text-sm">
            {app.checksRunAt === null
              ? 'Checks not yet run.'
              : 'None open at Needs attention or Urgent review.'}
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {findings.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <PriorityBadge priority={x.priority} />
                <span className="font-medium">{x.title}</span>
              </li>
            ))}
          </ul>
        )}
        {loanAlerts.length > 0 && (
          <p className="border-line border-t px-5 py-3 text-sm">
            Post-disbursement: {loanAlerts.length} monitoring alert(s) on the resulting loan.{' '}
            <Link
              className="text-primary font-semibold hover:underline"
              to={`/monitoring?loan=${loanAlerts[0]?.loanId ?? ''}`}
            >
              Open monitoring
            </Link>
          </p>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Recent actions & notes</h3>
        <ul className="space-y-2 text-sm">
          {[...app.audit]
            .reverse()
            .slice(0, 5)
            .map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.action}</span>{' '}
                <span className="text-muted">
                  — {a.actor}, {f.dateTime(a.at)}
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
