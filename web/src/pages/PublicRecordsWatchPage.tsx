import { BellRing, Landmark } from 'lucide-react';
import { Link } from 'react-router';
import { WatchCard } from '../components/monitoring/WatchCard.js';
import { WatchForm } from '../components/monitoring/WatchForm.js';
import { LinkButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, Notice } from '../components/ui/States.js';
import { addPublicWatch } from '../state/actions.js';
import { useActor } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';

/** Post-disbursement watch: every disbursed loan is checked against public records automatically. */
export function PublicRecordsWatchPage(): React.JSX.Element {
  const db = useDb();
  const actor = useActor();
  const session = useSession();
  const toast = useToast();
  const [focus] = useUrlState('watch', '');
  const flagged = db.publicWatches.filter((w) => w.events.length > 0 || w.id === focus);
  return (
    <div className="space-y-4">
      <PageHeader
        docTitle="Public-records watch"
        title="Public-records watch"
        subtitle="Every disbursed loan is checked automatically for new insolvency, liquidation or enforcement records about the borrower."
        actions={<LinkButton to="/monitoring">Transaction monitoring</LinkButton>}
      />
      <Notice title="Public records checked">
        Records are checked against public records like IBBI, MCA, ED, RBI, NFRA, SFIO and SEBI.
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
