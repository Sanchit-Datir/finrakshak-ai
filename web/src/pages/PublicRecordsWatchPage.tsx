import { BellRing, Database, Landmark } from 'lucide-react';
import { Link } from 'react-router';
import { WatchCard } from '../components/monitoring/WatchCard.js';
import { WatchForm } from '../components/monitoring/WatchForm.js';
import { Badge } from '../components/ui/Badge.js';
import { LinkButton } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, Notice } from '../components/ui/States.js';
import { DataTable } from '../components/ui/Table.js';
import type { PublicWatch } from '../domain/schemas.js';
import { formatMoney } from '../lib/format.js';
import { addPublicWatch } from '../state/actions.js';
import { useActor, useFormat } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';

const MATCH: Record<string, string> = {
  cin: 'Matched by CIN',
  exact_name: 'Matched by exact name',
  ambiguous: 'Ambiguous name',
  none: 'Not in public records',
  via_applicant_record: 'Found',
};

function OtherLoans({ watches }: { watches: PublicWatch[] }): React.JSX.Element {
  const f = useFormat();
  return (
    <Card>
      <CardHeader
        title="Other watched loans"
        subtitle="No public record dated after disbursement. Fictional demo borrowers are never found in public records."
      />
      <DataTable
        caption="Other watched loans"
        dense
        rows={watches}
        rowKey={(w) => w.id}
        empty={<p className="text-muted p-4 text-sm">None.</p>}
        columns={[
          {
            key: 'loan',
            header: 'Loan',
            render: (w) => <span className="font-medium">{w.loanRef}</span>,
          },
          { key: 'borrower', header: 'Borrower', render: (w) => w.borrowerName },
          { key: 'disbursed', header: 'Disbursed', render: (w) => f.date(w.disbursedOn) },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (w) => <span className="tabular">{formatMoney(w.amountMinor)}</span>,
          },
          {
            key: 'match',
            header: 'Public records',
            render: (w) =>
              w.lastCheck === null ? 'Not checked yet' : (MATCH[w.lastCheck.subject.match] ?? ''),
          },
          {
            key: 'checked',
            header: 'Last checked',
            render: (w) => (w.lastCheck === null ? '—' : f.dateTime(w.lastCheck.checkedAt)),
          },
        ]}
      />
    </Card>
  );
}

/** Post-disbursement watch: every disbursed loan is checked against public records automatically. */
export function PublicRecordsWatchPage(): React.JSX.Element {
  const db = useDb();
  const actor = useActor();
  const session = useSession();
  const toast = useToast();
  const [focus] = useUrlState('watch', '');
  const flagged = db.publicWatches.filter((w) => w.events.length > 0 || w.id === focus);
  const others = db.publicWatches.filter((w) => !flagged.includes(w));
  return (
    <div className="space-y-4">
      <PageHeader
        docTitle="Public-records watch"
        title="Public-records watch"
        subtitle="Every disbursed loan is checked automatically for new insolvency, liquidation or enforcement records about the borrower."
        badge={
          <Badge tone="info" icon={Database}>
            Real public data · local copy
          </Badge>
        }
        actions={<LinkButton to="/monitoring">Transaction monitoring</LinkButton>}
      />
      <Notice title="How it works in this prototype">
        When you sign in, every loan in the loan book is checked (once a day) against the local copy
        of public records: IBBI, MCA Maharashtra, ED, RBI, NFRA, SFIO and a SEBI sample. Each record
        dated after disbursement raises one alert. In production a scheduled job would run this
        against a live feed.
      </Notice>
      <section aria-label="Loans with new public records" className="space-y-4">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <BellRing className="text-danger size-5" aria-hidden /> Loans with new public records (
          {flagged.length})
        </h2>
        {flagged.length === 0 ? (
          <Card>
            <EmptyState icon={Landmark} title="No new public records on disbursed loans">
              Checks run automatically after sign-in. <Link to="/alerts">Alerts</Link> lists
              anything raised.
            </EmptyState>
          </Card>
        ) : (
          flagged.map((w) => (
            <WatchCard key={w.id} watch={w} actor={actor} highlighted={w.id === focus} />
          ))
        )}
      </section>
      <OtherLoans watches={others} />
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Watch a loan that is not in the loan book
        </summary>
        <div className="mt-3">
          <WatchForm
            branchId={session?.branchId ?? db.branches[0]?.id ?? 'br-shirur'}
            onAdd={(input) => {
              const id = addPublicWatch(actor, input);
              toast.push({
                tone: 'success',
                title: `${id} added`,
                detail: 'Run a check to look for new public records.',
              });
            }}
          />
        </div>
      </details>
    </div>
  );
}
