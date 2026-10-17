import { BellRing, CircleCheck, Landmark } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicWatch } from '../../domain/schemas.js';
import { useFormat } from '../../state/hooks.js';
import { Badge } from '../ui/Badge.js';
import { Card, CardHeader } from '../ui/Card.js';

const KIND_TEXT = {
  insolvency: 'Insolvency',
  liquidation: 'Liquidation',
  enforcement: 'Enforcement',
};

function latest(w: PublicWatch): PublicWatch['events'][number] | undefined {
  return [...w.events].sort((a, b) => (b.record.date ?? '').localeCompare(a.record.date ?? ''))[0];
}

/** Dashboard summary: disbursed loans whose borrower appeared in new public records. */
export function PublicRecordsLoansCard({ watches }: { watches: PublicWatch[] }): React.JSX.Element {
  const f = useFormat();
  const flagged = watches.filter((w) => w.events.length > 0);
  const checked = watches.filter((w) => w.lastCheck !== null);
  const last = checked
    .map((w) => w.lastCheck?.checkedAt ?? '')
    .sort()
    .at(-1);
  return (
    <section aria-label="Public records on disbursed loans">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Landmark className="text-teal size-5" aria-hidden /> Public records on disbursed
              loans
            </span>
          }
          subtitle={
            checked.length === 0
              ? 'Not checked yet: loans are checked automatically after sign-in.'
              : `${checked.length} loan(s) checked automatically${last === undefined || last === '' ? '' : ` · last ${f.dateTime(last)}`}`
          }
          actions={
            flagged.length > 0 ? (
              <Badge tone="danger" icon={BellRing}>
                {flagged.length} loan(s) with new records
              </Badge>
            ) : (
              <Badge tone="ok" icon={CircleCheck}>
                No new records
              </Badge>
            )
          }
        />
        {flagged.length > 0 && (
          <ul className="divide-line divide-y px-5 pb-4 text-sm">
            {flagged.map((w) => {
              const ev = latest(w);
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link
                    to={`/monitoring/public-records?watch=${encodeURIComponent(w.id)}`}
                    className="text-primary font-semibold hover:underline"
                  >
                    {w.loanRef} · {w.borrowerName}
                  </Link>
                  <span className="text-muted text-xs">
                    {w.events.length} record(s) since disbursement on {f.date(w.disbursedOn)}
                    {ev !== undefined &&
                      ` · latest: ${KIND_TEXT[ev.record.kind]}, ${ev.record.date === null ? 'undated' : f.date(ev.record.date)}`}
                  </span>
                  <Badge tone="danger" className="ml-auto">
                    Urgent review
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
