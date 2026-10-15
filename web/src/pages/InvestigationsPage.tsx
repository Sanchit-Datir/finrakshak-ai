import { BriefcaseBusiness, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Dialog } from '../components/ui/Dialog.js';
import { FilterSelect, SelectField, TextArea, TextField } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { DemoBadge, EmptyState } from '../components/ui/States.js';
import { CaseStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { CASE_STATUS_LABEL, PRIORITY_LABEL } from '../domain/labels.js';
import { CaseStatusSchema, PrioritySchema, type Case, type Priority } from '../domain/schemas.js';
import { inRange, resolvePeriod, type PeriodKind } from '../lib/period.js';
import { matchesQuery } from '../lib/text.js';
import { createCase } from '../state/actions.js';
import { useActor, useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';

const SOURCE: Record<Case['source'], string> = {
  pre_disbursement: 'Pre-disbursement',
  monitoring: 'Monitoring',
  referral: 'Referral',
};

export function InvestigationsPage(): React.JSX.Element {
  const db = useDb();
  const f = useFormat();
  const [q, setQ] = useUrlState('q', '');
  const [status, setStatus] = useUrlState('status', 'all');
  const [priority, setPriority] = useUrlState('priority', 'all');
  const [branch, setBranch] = useUrlState('branch', 'all');
  const [owner, setOwner] = useUrlState('owner', 'all');
  const [source, setSource] = useUrlState('source', 'all');
  const [period, setPeriod] = useUrlState('opened', 'all');
  const [creating, setCreating] = useState(false);
  const owners = [...new Set(db.cases.map((c) => c.owner))].sort();

  const name = useMemo(
    () =>
      (id: string): string =>
        db.borrowers.find((b) => b.id === id)?.name ?? id,
    [db],
  );
  const rows = useMemo(() => {
    const range =
      period === 'all' ? null : resolvePeriod({ kind: period as PeriodKind, from: '', to: '' });
    return db.cases.filter(
      (c) =>
        (status === 'all' ||
          (status === 'open'
            ? c.status !== 'resolved' && c.status !== 'closed'
            : c.status === status)) &&
        (priority === 'all' || c.priority === priority) &&
        (branch === 'all' || c.branchId === branch) &&
        (owner === 'all' || c.owner === owner) &&
        (source === 'all' || c.source === source) &&
        (range === null || inRange(c.openedAt, range)) &&
        matchesQuery(
          q,
          c.id,
          c.title,
          c.summary,
          ...c.loanIds,
          ...c.borrowerIds.map(name),
          ...c.entityIds.map((e) => db.entities.find((x) => x.id === e)?.name ?? ''),
        ),
    );
  }, [db, name, q, status, priority, branch, owner, source, period]);

  return (
    <>
      <PageHeader
        docTitle="Investigations"
        title="Investigations"
        badge={<DemoBadge />}
        subtitle="Cases bring together evidence, related entities and transactions. A case does not imply anyone is guilty."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setCreating(true);
            }}
          >
            New case
          </Button>
        }
      />
      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Case ID, borrower, company, loan, finding…"
            className="lg:col-span-2"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'open', label: 'Open (not resolved / closed)' },
              ...CaseStatusSchema.options.map((s) => ({ value: s, label: CASE_STATUS_LABEL[s] })),
            ]}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'all', label: 'All priorities' },
              ...PrioritySchema.options.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
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
            label="Owner"
            value={owner}
            onChange={setOwner}
            options={[
              { value: 'all', label: 'Anyone' },
              ...owners.map((o) => ({ value: o, label: o })),
            ]}
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: 'all', label: 'All sources' },
              ...Object.entries(SOURCE).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
          <div>
            <PeriodPicker
              label="Date opened"
              value={{ kind: period === 'all' ? '30d' : (period as PeriodKind), from: '', to: '' }}
              options={['7d', '30d', 'month', 'last_month']}
              onChange={(v) => {
                setPeriod(v.kind);
              }}
            />
            {period !== 'all' && (
              <button
                type="button"
                className="text-primary mt-1 text-xs font-semibold hover:underline"
                onClick={() => {
                  setPeriod('all');
                }}
              >
                Any date
              </button>
            )}
          </div>
        </div>
        <DataTable
          caption="Investigation cases"
          rows={rows}
          rowKey={(c) => c.id}
          initialSort={{ key: 'updated', dir: 'desc' }}
          empty={
            <EmptyState icon={BriefcaseBusiness} title="No cases match these filters">
              Try clearing filters. Cases can be opened from any alert.
            </EmptyState>
          }
          columns={[
            {
              key: 'id',
              header: 'Case ID',
              sortValue: (c) => c.id,
              render: (c) => (
                <Link
                  className="text-primary tabular font-semibold hover:underline"
                  to={`/investigations/${c.id}`}
                >
                  {c.id}
                </Link>
              ),
            },
            {
              key: 'title',
              header: 'Title',
              sortValue: (c) => c.title,
              render: (c) => <span className="font-medium">{c.title}</span>,
            },
            {
              key: 'linked',
              header: 'Linked borrower / entity',
              render: (c) => (
                <span className="text-xs">{c.borrowerIds.map(name).join(', ') || '—'}</span>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              sortValue: (c) => ({ urgent: 0, needs_attention: 1, routine: 2 })[c.priority],
              render: (c) => <PriorityBadge priority={c.priority} />,
            },
            { key: 'owner', header: 'Owner', sortValue: (c) => c.owner, render: (c) => c.owner },
            {
              key: 'opened',
              header: 'Opened',
              sortValue: (c) => c.openedAt,
              render: (c) => (
                <span className="tabular whitespace-nowrap">{f.date(c.openedAt)}</span>
              ),
            },
            {
              key: 'updated',
              header: 'Last update',
              sortValue: (c) => c.updatedAt,
              render: (c) => (
                <span className="tabular whitespace-nowrap">{f.date(c.updatedAt)}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortValue: (c) => c.status,
              render: (c) => <CaseStatusBadge status={c.status} />,
            },
          ]}
        />
      </Card>
      <NewCaseDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}

function NewCaseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const db = useDb();
  const actor = useActor();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<Priority>('needs_attention');
  const [borrowerId, setBorrowerId] = useState('');
  const [touched, setTouched] = useState(false);
  const submit = (): void => {
    setTouched(true);
    if (title.trim() === '') return;
    const b = db.borrowers.find((x) => x.id === borrowerId);
    const id = createCase(actor, {
      title: title.trim(),
      summary: summary.trim(),
      priority,
      branchId: b?.branchId ?? db.branches[0]?.id ?? '',
      source: 'referral',
      borrowerIds: b === undefined ? [] : [b.id],
      entityIds: b === undefined ? [] : [b.entityId],
      loanIds: db.loans.filter((l) => l.borrowerId === borrowerId).map((l) => l.id),
      applicationIds: db.applications.filter((a) => a.borrowerId === borrowerId).map((a) => a.id),
      alertIds: [],
    });
    toast.push({ tone: 'success', title: `${id} opened` });
    setTitle('');
    setSummary('');
    setTouched(false);
    onClose();
    void navigate(`/investigations/${id}`);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Open a new case"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Open case
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextField
          label="Title"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          error={touched && title.trim() === '' ? 'Enter a short, neutral title.' : null}
          hint="Describe the concern neutrally — do not label anyone guilty."
        />
        <TextArea
          label="Summary"
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
          }}
        />
        <SelectField
          label="Review priority"
          value={priority}
          onChange={(e) => {
            setPriority(PrioritySchema.parse(e.target.value));
          }}
        >
          {PrioritySchema.options.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Linked borrower (optional)"
          value={borrowerId}
          onChange={(e) => {
            setBorrowerId(e.target.value);
          }}
        >
          <option value="">None</option>
          {db.borrowers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>
    </Dialog>
  );
}
