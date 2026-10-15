import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { PRODUCT_LABEL } from '../../domain/labels.js';
import type { Application, Db } from '../../domain/schemas.js';
import { reviewPriority } from '../../lib/checks.js';
import { formatMoney } from '../../lib/format.js';
import { useFormat } from '../../state/hooks.js';
import { AppStatusBadge, PriorityBadge } from '../ui/StatusBadges.js';
import { DataTable } from '../ui/Table.js';

export function applicantName(a: Application): string {
  return a.data.business.businessName || a.data.applicant.fullName || 'Untitled application';
}

export function ApplicationsTable({
  apps,
  db,
  caption,
  empty,
  showAmount = false,
}: {
  apps: Application[];
  db: Db;
  caption: string;
  empty?: React.ReactNode;
  showAmount?: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const branch = (id: string): string =>
    db.branches.find((b) => b.id === id)?.name.replace(' Branch', '') ?? id;
  return (
    <DataTable
      caption={caption}
      rows={apps}
      rowKey={(a) => a.id}
      initialSort={{ key: 'submitted', dir: 'desc' }}
      {...(empty === undefined ? {} : { empty })}
      columns={[
        {
          key: 'id',
          header: 'Application ID',
          sortValue: (a) => a.id,
          render: (a) => (
            <Link
              className="text-primary tabular font-semibold hover:underline"
              to={`/applications/${a.id}`}
            >
              {a.id}
            </Link>
          ),
        },
        {
          key: 'name',
          header: 'Applicant / business',
          sortValue: applicantName,
          render: (a) => <span className="font-medium">{applicantName(a)}</span>,
        },
        {
          key: 'type',
          header: 'Loan type',
          sortValue: (a) => PRODUCT_LABEL[a.data.loan.product],
          render: (a) => <span className="text-muted">{PRODUCT_LABEL[a.data.loan.product]}</span>,
        },
        ...(showAmount
          ? [
              {
                key: 'amount',
                header: 'Amount',
                align: 'right' as const,
                sortValue: (a: Application) => a.data.loan.amountMinor ?? 0,
                render: (a: Application) => formatMoney(a.data.loan.amountMinor),
              },
            ]
          : []),
        {
          key: 'branch',
          header: 'Branch',
          sortValue: (a) => branch(a.branchId),
          render: (a) => branch(a.branchId),
        },
        {
          key: 'submitted',
          header: 'Submitted',
          sortValue: (a) => a.submittedAt ?? a.createdAt,
          render: (a) => (
            <span className="tabular whitespace-nowrap">
              {a.submittedAt === null ? 'Not submitted' : f.date(a.submittedAt)}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Review status',
          sortValue: (a) => a.status,
          render: (a) => <AppStatusBadge status={a.status} />,
        },
        {
          key: 'risk',
          header: 'Risk indicator',
          render: (a) => <PriorityBadge priority={reviewPriority(a, db)} />,
        },
        {
          key: 'view',
          header: 'Action',
          render: (a) => (
            <Link
              to={a.status === 'draft' ? `/applications/${a.id}/edit` : `/applications/${a.id}`}
              className="text-primary inline-flex items-center gap-0.5 text-sm font-semibold hover:underline"
            >
              {a.status === 'draft' ? 'Continue' : 'View'}{' '}
              <ChevronRight className="size-4" aria-hidden />
              <span className="sr-only"> {a.id}</span>
            </Link>
          ),
        },
      ]}
    />
  );
}
