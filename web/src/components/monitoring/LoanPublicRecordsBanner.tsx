import { Link } from 'react-router';
import type { PublicWatch } from '../../domain/schemas.js';
import { useFormat } from '../../state/hooks.js';
import { Notice } from '../ui/States.js';

/** Shown on a loan in Post-disbursement Monitoring when its borrower has new public records. */
export function LoanPublicRecordsBanner({
  watch,
}: {
  watch: PublicWatch | undefined;
}): React.JSX.Element | null {
  const f = useFormat();
  if (watch === undefined || watch.events.length === 0) return null;
  const kinds = [...new Set(watch.events.map((e) => e.record.kind))].join(', ');
  return (
    <Notice
      tone="danger"
      title={`${watch.events.length} public record(s) about this borrower since disbursement`}
      className="mb-6"
    >
      Found by the automatic public-records watch ({kinds}) after the loan was disbursed on{' '}
      {f.date(watch.disbursedOn)}. Urgent review.{' '}
      <Link
        className="font-semibold underline"
        to={`/monitoring/public-records?watch=${encodeURIComponent(watch.id)}`}
      >
        See the timeline and evidence
      </Link>
    </Notice>
  );
}
