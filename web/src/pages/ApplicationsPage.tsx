import { FilePlus2, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { ApplicationsTable, applicantName } from '../components/applications/ApplicationsTable.js';
import { LinkButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { EmptyState } from '../components/ui/States.js';
import { APP_STATUS_LABEL, PRIORITY_LABEL, PRODUCT_LABEL } from '../domain/labels.js';
import { ApplicationStatusSchema, LoanProductSchema } from '../domain/schemas.js';
import { reviewPriority } from '../lib/checks.js';
import { matchesQuery } from '../lib/text.js';
import { useUrlState } from '../state/url.js';
import { useDb } from '../state/store.js';
import { useBranchScope } from '../state/scope.js';

const AWAITING = new Set(['documents_needed', 'processing', 'needs_review', 'ready_for_decision']);

export function ApplicationsPage(): React.JSX.Element {
  const db = useDb();
  const [q, setQ] = useUrlState('q', '');
  const [status, setStatus] = useUrlState('status', 'all');
  const [priority, setPriority] = useUrlState('priority', 'all');
  const { scope } = useBranchScope();
  const [branch, setBranch] = useUrlState('branch', scope);
  const [product, setProduct] = useUrlState('product', 'all');

  const rows = useMemo(
    () =>
      db.applications.filter((a) => {
        if (
          status === 'awaiting' ? !AWAITING.has(a.status) : status !== 'all' && a.status !== status
        )
          return false;
        if (branch !== 'all' && a.branchId !== branch) return false;
        if (product !== 'all' && a.data.loan.product !== product) return false;
        if (priority !== 'all') {
          const p = reviewPriority(a, db);
          if (priority === 'none' ? p !== null : p !== priority) return false;
        }
        return matchesQuery(
          q,
          a.id,
          applicantName(a),
          a.data.applicant.fullName,
          a.data.loan.purpose,
        );
      }),
    [db, q, status, priority, branch, product],
  );

  return (
    <>
      <PageHeader
        docTitle="Loan applications"
        title="Loan applications"
        subtitle="All applications in this workspace. Filters are kept in the address bar."
        actions={
          <LinkButton to="/applications/new" variant="primary" icon={Plus}>
            New Application
          </LinkButton>
        }
      />
      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="ID, applicant, purpose…"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'awaiting', label: 'Awaiting review (any)' },
              ...ApplicationStatusSchema.options.map((s) => ({
                value: s,
                label: APP_STATUS_LABEL[s],
              })),
            ]}
          />
          <FilterSelect
            label="Review priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'all', label: 'All priorities' },
              ...(['urgent', 'needs_attention', 'routine'] as const).map((p) => ({
                value: p,
                label: PRIORITY_LABEL[p],
              })),
              { value: 'none', label: 'Checks not run' },
            ]}
          />
          <FilterSelect
            label="Branch"
            value={branch}
            onChange={setBranch}
            options={[
              { value: 'all', label: 'All branches' },
              ...db.branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <FilterSelect
            label="Loan product"
            value={product}
            onChange={setProduct}
            options={[
              { value: 'all', label: 'All products' },
              ...LoanProductSchema.options.map((p) => ({ value: p, label: PRODUCT_LABEL[p] })),
            ]}
          />
        </div>
        <p className="text-muted border-line border-t px-4 py-2 text-xs" aria-live="polite">
          Showing {rows.length} of {db.applications.length} applications
        </p>
        <ApplicationsTable
          apps={rows}
          db={db}
          caption="Loan applications"
          showAmount
          empty={
            <EmptyState icon={FilePlus2} title="No applications match these filters">
              Try clearing a filter or searching for a different name.
            </EmptyState>
          }
        />
      </Card>
    </>
  );
}
