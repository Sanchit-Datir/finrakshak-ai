import {
  Activity,
  ArrowLeftRight,
  Bell,
  Download,
  FileUp,
  Landmark,
  Play,
  SearchCheck,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertDrawer, entityLabel } from '../components/monitoring/AlertDrawer.js';
import { TransactionFlow } from '../components/monitoring/TransactionFlow.js';
import { Badge } from '../components/ui/Badge.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { Dialog } from '../components/ui/Dialog.js';
import { FilterSelect, TextField } from '../components/ui/Field.js';
import { LoanPublicRecordsBanner } from '../components/monitoring/LoanPublicRecordsBanner.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { EmptyState, Notice } from '../components/ui/States.js';
import { AlertStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { PinButton } from '../components/ui/PinButton.js';
import { ALERT_STATUS_LABEL, PRODUCT_LABEL, TXN_TYPE_LABEL } from '../domain/labels.js';
import {
  AlertStatusSchema,
  TransactionTypeSchema,
  type Db,
  type Loan,
  type Transaction,
} from '../domain/schemas.js';
import { allAlerts, isOpen, type UnifiedAlert } from '../lib/alerts.js';
import { CSV_TEMPLATE, importCsv, type ImportResult } from '../lib/csv-import.js';
import { downloadFile, exportHeader, toCsv } from '../lib/export.js';
import { formatMoney, parseRupeesToMinor } from '../lib/format.js';
import { RULES } from '../lib/monitoring.js';
import { inRange, resolvePeriod, type PeriodValue } from '../lib/period.js';
import { matchesQuery } from '../lib/text.js';
import { importTransactions } from '../state/actions.js';
import { useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';
import { useBranchScope } from '../state/scope.js';
import { useCopilotTarget } from '../state/copilot.js';

const DAY = 86_400_000;

function loanTxns(db: Db, loan: Loan): Transaction[] {
  const start = new Date(loan.disbursedAt).getTime();
  const end = start + loan.monitoringDays * DAY;
  return db.transactions.filter(
    (t) =>
      t.loanId === loan.id ||
      (t.loanId === null && new Date(t.at).getTime() >= start && new Date(t.at).getTime() <= end),
  );
}

export function MonitoringPage(): React.JSX.Element {
  const db = useDb();
  const f = useFormat();
  const toast = useToast();
  const [loanId, setLoanId] = useUrlState('loan', db.loans[0]?.id ?? '');
  const [loanQuery, setLoanQuery] = useState('');
  const { scope } = useBranchScope();
  const [branch, setBranch] = useUrlState('branch', scope);
  const [type, setType] = useUrlState('type', 'all');
  const [alertStatus, setAlertStatus] = useUrlState('alerts', 'all');
  const [period, setPeriod] = useState<PeriodValue>({ kind: 'custom', from: '', to: '' });
  const [usePeriod, setUsePeriod] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [depth, setDepth] = useState('3');
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const loans = db.loans.filter((l) => branch === 'all' || l.branchId === branch);
  const loanOptions = loans.filter((l) =>
    matchesQuery(loanQuery, l.id, db.borrowers.find((b) => b.id === l.borrowerId)?.name, l.purpose),
  );
  const loan = db.loans.find((l) => l.id === loanId) ?? loans[0];
  useCopilotTarget(loan === undefined ? null : { kind: 'loan', id: loan.id });
  const alerts = useMemo(() => allAlerts(db).filter((a) => a.source === 'monitoring'), [db]);
  const scopedAlerts = alerts.filter((a) => loans.some((l) => l.id === a.loanId));
  const range = usePeriod ? resolvePeriod(period) : null;
  const min = parseRupeesToMinor(minAmount) ?? 0;

  const txns =
    loan === undefined
      ? []
      : loanTxns(db, loan).filter(
          (t) =>
            (type === 'all' || t.type === type) &&
            (range === null || inRange(t.at, range)) &&
            t.amountMinor >= min &&
            (counterparty.trim() === '' ||
              matchesQuery(counterparty, entityLabel(db, t.fromId), entityLabel(db, t.toId))),
        );

  const loanAlerts = alerts.filter(
    (a) =>
      a.loanId === loan?.id &&
      (alertStatus === 'all' ||
        (alertStatus === 'open' ? isOpen(a.status) : a.status === alertStatus)),
  );
  const flagged = new Map<string, UnifiedAlert[]>();
  for (const a of alerts.filter((x) => x.loanId === loan?.id))
    for (const id of a.monitoring?.transactionIds ?? [])
      flagged.set(id, [...(flagged.get(id) ?? []), a]);
  const highlight = new Set(
    alerts.find((a) => a.id === selectedAlert)?.monitoring?.transactionIds ?? [],
  );
  const analysed = loans.reduce((n, l) => n + loanTxns(db, l).length, 0);
  const openCases = db.cases.filter(
    (c) =>
      c.status !== 'resolved' &&
      c.status !== 'closed' &&
      c.loanIds.some((id) => loans.some((l) => l.id === id)),
  );
  const borrower = db.borrowers.find((b) => b.id === loan?.borrowerId);

  const runAnalysis = (): void => {
    const at = new Date().toISOString();
    setLastRun(at);
    toast.push({
      tone: 'success',
      title: 'Monitoring rules evaluated',
      detail: `${Object.keys(RULES).length} deterministic rules over ${analysed} transaction(s); ${scopedAlerts.length} alert(s) currently raised.`,
    });
  };
  const exportResults = (): void => {
    const rows = scopedAlerts.map((a) => [
      a.id,
      a.loanId ?? '',
      a.title,
      a.monitoring === null ? '' : RULES[a.monitoring.ruleId].name,
      a.priority,
      ALERT_STATUS_LABEL[a.status],
      a.monitoring === null ? '' : (a.monitoring.totalMinor / 100).toFixed(2),
      a.monitoring?.transactionIds.join(' ') ?? '',
      a.at,
    ]);
    const csv = toCsv(
      [
        'alert_id',
        'loan_id',
        'title',
        'rule',
        'priority',
        'status',
        'amount_in_sequence_inr',
        'transaction_ids',
        'detected_at',
      ],
      rows,
    );
    downloadFile(
      `monitoring-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
      `${exportHeader('# Monitoring results', branch === 'all' ? 'All branches' : branch).replace(/^/gm, '# ')}\n${csv}`,
      'text/csv',
    );
    toast.push({
      tone: 'success',
      title: 'Results exported',
      detail: `${rows.length} alert(s). Account numbers are not included.`,
    });
  };

  return (
    <>
      <PageHeader
        docTitle="Loan book"
        title="Loan book"
        subtitle="Post-disbursement monitoring: transaction patterns and movements that may need attention."
        actions={
          <>
            <LinkButton to="/monitoring/public-records" icon={Landmark}>
              Public-records watch
            </LinkButton>
            <Button
              icon={FileUp}
              onClick={() => {
                setImportOpen(true);
              }}
            >
              Import transaction file
            </Button>
            <Button icon={Play} onClick={runAnalysis}>
              Run analysis
            </Button>
            <Button icon={Download} onClick={exportResults}>
              Export results
            </Button>
          </>
        }
      />
      {lastRun !== null && (
        <p className="text-muted -mt-4 mb-4 text-xs" role="status">
          Rules last evaluated {f.dateTime(lastRun)} (in your browser).
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Activity, label: 'Loans under monitoring', value: loans.length },
          { icon: ArrowLeftRight, label: 'Transactions analysed', value: analysed },
          {
            icon: Bell,
            label: 'New alerts',
            value: scopedAlerts.filter((a) => a.status === 'new').length,
          },
          { icon: SearchCheck, label: 'Open investigations', value: openCases.length },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="tabular text-2xl font-bold">{value}</p>
              <p className="text-muted text-xs">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <SearchInput
              label="Find loan / borrower"
              value={loanQuery}
              onChange={setLoanQuery}
              placeholder="Loan ID or borrower…"
            />
            <FilterSelect
              label="Loan"
              value={loan?.id ?? ''}
              onChange={setLoanId}
              className="mt-2"
              options={
                loanOptions.length === 0
                  ? [{ value: '', label: 'No matching loans' }]
                  : loanOptions.map((l) => ({
                      value: l.id,
                      label: `${l.id} — ${db.borrowers.find((b) => b.id === l.borrowerId)?.name ?? ''}`,
                    }))
              }
            />
          </div>
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
            label="Transaction type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All types' },
              ...TransactionTypeSchema.options.map((t) => ({ value: t, label: TXN_TYPE_LABEL[t] })),
            ]}
          />
          <FilterSelect
            label="Alert status"
            value={alertStatus}
            onChange={setAlertStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open (new, in review, escalated)' },
              ...AlertStatusSchema.options.map((s) => ({ value: s, label: ALERT_STATUS_LABEL[s] })),
            ]}
          />
          <div className="sm:col-span-2">
            <PeriodPicker
              label="Date range"
              value={usePeriod ? period : { ...period, kind: 'custom' }}
              onChange={(v) => {
                setPeriod(v);
                setUsePeriod(true);
              }}
              options={['7d', '30d', 'month', 'custom']}
            />
            {usePeriod && (
              <button
                type="button"
                className="text-primary mt-1 text-xs font-semibold hover:underline"
                onClick={() => {
                  setUsePeriod(false);
                }}
              >
                Show whole monitoring period
              </button>
            )}
          </div>
          <TextField
            label="Minimum amount (₹)"
            inputMode="decimal"
            value={minAmount}
            onChange={(e) => {
              setMinAmount(e.target.value);
            }}
          />
          <TextField
            label="Counterparty contains"
            value={counterparty}
            onChange={(e) => {
              setCounterparty(e.target.value);
            }}
          />
        </div>
      </Card>

      {loan === undefined ? (
        <Card>
          <EmptyState icon={Activity} title="No loans under monitoring">
            Disbursed loans appear here once recorded. Try a different branch filter.
          </EmptyState>
        </Card>
      ) : (
        <>
          <LoanPublicRecordsBanner watch={db.publicWatches.find((w) => w.loanId === loan.id)} />
          <Card className="mb-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {loan.id} ·{' '}
                  {borrower === undefined ? (
                    ''
                  ) : (
                    <Link className="text-primary hover:underline" to={`/borrowers/${borrower.id}`}>
                      {borrower.name}
                    </Link>
                  )}
                </h2>
                <p className="text-muted text-sm">
                  {PRODUCT_LABEL[loan.product]} · Stated purpose: {loan.purpose}
                  {loan.applicationId !== null && (
                    <>
                      {' '}
                      ·{' '}
                      <Link
                        className="text-primary hover:underline"
                        to={`/applications/${loan.applicationId}`}
                      >
                        {loan.applicationId}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={loan.dataSource.startsWith('No ') ? 'warn' : 'info'}>
                  Data source: {loan.dataSource}
                </Badge>
                <PinButton
                  pin={{
                    href: `/monitoring?loan=${encodeURIComponent(loan.id)}`,
                    title: `${loan.id}${borrower === undefined ? '' : ` · ${borrower.name}`}`,
                    kind: 'loan',
                  }}
                />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted text-xs">Disbursed</dt>
                <dd className="tabular font-semibold">{f.date(loan.disbursedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Amount</dt>
                <dd className="tabular font-semibold">{formatMoney(loan.amountMinor)}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Monitoring period</dt>
                <dd className="tabular font-semibold">
                  {f.date(loan.disbursedAt)} –{' '}
                  {f.date(
                    new Date(
                      new Date(loan.disbursedAt).getTime() + loan.monitoringDays * DAY,
                    ).toISOString(),
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Last updated</dt>
                <dd className="tabular font-semibold">{f.dateTime(loan.lastUpdated)}</dd>
              </div>
            </dl>
          </Card>
          <Card className="mb-6">
            <CardHeader
              title="Alerts for this loan"
              subtitle="Select to highlight in the flow; open for evidence."
            />
            {loanAlerts.length === 0 ? (
              <EmptyState icon={Bell} title="No alerts match these filters">
                No configured rule raised an alert for this loan with the current filter. This is
                not a guarantee that funds were used as declared.
              </EmptyState>
            ) : (
              <ul className="divide-line grid divide-y md:grid-cols-2 md:divide-y-0 xl:grid-cols-3">
                {loanAlerts.map((a) => (
                  <li
                    key={a.id}
                    className={`px-5 py-3 ${selectedAlert === a.id ? 'bg-primary-soft/50' : ''}`}
                  >
                    <div className="flex flex-wrap gap-2">
                      <PriorityBadge priority={a.priority} />
                      <AlertStatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 text-sm font-medium">{a.title}</p>
                    <p className="text-muted text-xs">{a.reason}</p>
                    <div className="mt-1.5 flex gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        aria-pressed={selectedAlert === a.id}
                        onClick={() => {
                          setSelectedAlert(selectedAlert === a.id ? null : a.id);
                        }}
                      >
                        {selectedAlert === a.id ? 'Clear highlight' : 'Highlight in flow'}
                      </button>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => {
                          setOpenAlert(a.id);
                        }}
                      >
                        Open details
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="mb-6 grid gap-6">
            <Card>
              <CardHeader
                title="Transaction flow"
                subtitle="Observed transfers outward from the disbursement, in time order."
                actions={
                  <FilterSelect
                    label="Graph depth"
                    value={depth}
                    onChange={setDepth}
                    options={[
                      { value: '1', label: '1 hop' },
                      { value: '2', label: '2 hops' },
                      { value: '3', label: '3 hops' },
                      { value: '5', label: '5 hops' },
                    ]}
                  />
                }
              />
              <div className="px-4 pb-4">
                <TransactionFlow
                  db={db}
                  loan={loan}
                  txns={txns}
                  highlight={highlight}
                  maxDepth={Number(depth)}
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Transactions"
              subtitle={`${txns.length} record(s) after filters · accounts masked · also the table alternative to the flow graph`}
            />
            <DataTable
              caption={`Transactions for ${loan.id}`}
              rows={txns}
              rowKey={(t) => t.id}
              dense
              initialSort={{ key: 'at', dir: 'asc' }}
              empty={
                <EmptyState
                  icon={ArrowLeftRight}
                  title="No transaction records are available for this loan."
                >
                  {loan.dataSource.startsWith('No ')
                    ? 'Import an authorised transaction file to begin monitoring.'
                    : 'No records match the current filters.'}
                </EmptyState>
              }
              columns={[
                {
                  key: 'at',
                  header: 'Date / time',
                  sortValue: (t) => t.at,
                  render: (t) => (
                    <span className="tabular whitespace-nowrap">{f.dateTime(t.at)}</span>
                  ),
                },
                {
                  key: 'id',
                  header: 'Transaction ID',
                  sortValue: (t) => t.id,
                  render: (t) => <span className="tabular">{t.id}</span>,
                },
                {
                  key: 'from',
                  header: 'From',
                  sortValue: (t) => entityLabel(db, t.fromId),
                  render: (t) => <span className="text-xs">{entityLabel(db, t.fromId)}</span>,
                },
                {
                  key: 'to',
                  header: 'To',
                  sortValue: (t) => entityLabel(db, t.toId),
                  render: (t) => <span className="text-xs">{entityLabel(db, t.toId)}</span>,
                },
                {
                  key: 'amt',
                  header: 'Amount',
                  align: 'right',
                  sortValue: (t) => t.amountMinor,
                  render: (t) => formatMoney(t.amountMinor),
                },
                {
                  key: 'type',
                  header: 'Type',
                  sortValue: (t) => t.type,
                  render: (t) => TXN_TYPE_LABEL[t.type],
                },
                {
                  key: 'loan',
                  header: 'Related loan',
                  render: (t) => t.loanId ?? <span className="text-muted text-xs">Not tagged</span>,
                },
                {
                  key: 'flag',
                  header: 'Monitoring indicator',
                  render: (t) => {
                    const as = flagged.get(t.id) ?? [];
                    return as.length === 0 ? (
                      <span className="text-muted text-xs">None</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {as.map((a) => (
                          <PriorityBadge key={a.id} priority={a.priority} />
                        ))}
                      </div>
                    );
                  },
                },
                {
                  key: 'act',
                  header: 'Action',
                  render: (t) => {
                    const a = flagged.get(t.id)?.[0];
                    return a === undefined ? null : (
                      <button
                        type="button"
                        className="text-primary text-sm font-semibold hover:underline"
                        onClick={() => {
                          setOpenAlert(a.id);
                        }}
                      >
                        View alert<span className="sr-only"> for {t.id}</span>
                      </button>
                    );
                  },
                },
              ]}
            />
          </Card>
        </>
      )}

      <AlertDrawer
        alert={alerts.find((a) => a.id === openAlert) ?? null}
        onClose={() => {
          setOpenAlert(null);
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
      />
    </>
  );
}

function ImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<(ImportResult & { filename: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = (): void => {
    setResult(null);
    setError(null);
    onClose();
  };
  const read = async (file: File): Promise<void> => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('File is larger than 5 MB. Split it and import in parts.');
      return;
    }
    try {
      setResult({ ...importCsv(await file.text(), db), filename: file.name });
    } catch {
      setError('The file could not be read. Check it is a UTF-8 CSV file.');
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Import transaction file"
      description="CSV extract of authorised transaction records. Parsed and validated in your browser."
      footer={
        <>
          <Button
            onClick={() => {
              downloadFile('transactions-template.csv', CSV_TEMPLATE, 'text/csv');
            }}
            icon={Download}
          >
            Download template
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={result === null || result.rows.length === 0}
            onClick={() => {
              if (result === null) return;
              const n = importTransactions(result.rows, result.newEntities, result.filename);
              toast.push({
                tone: 'success',
                title: `${n} transaction(s) imported`,
                detail: 'Monitoring rules re-evaluated automatically.',
              });
              close();
            }}
          >
            Import {result?.rows.length ?? 0} valid row(s)
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          Required columns:{' '}
          <code className="text-xs">
            transaction_id, loan_id, datetime, from_account, to_account, amount_inr, type, reference
          </code>
          . Accounts may be existing IDs (e.g. <code className="text-xs">a-dnyaneshwar</code>) or
          counterparty names — unknown names are added as unverified counterparties.
        </p>
        <Notice tone="warn">
          Only import records you are authorised to use. Use synthetic data in this prototype.
        </Notice>
        <Button icon={FileUp} onClick={() => ref.current?.click()}>
          Choose CSV file
        </Button>
        <input
          ref={ref}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f !== undefined) void read(f);
          }}
        />
        {error !== null && <Notice tone="danger">{error}</Notice>}
        {result !== null && (
          <div role="status" className="space-y-2">
            <p>
              <strong>{result.filename}</strong>: {result.rows.length} valid, {result.errors.length}{' '}
              with errors, {result.duplicates} duplicate(s) skipped, {result.newEntities.length} new
              counterparty(ies).
            </p>
            {result.errors.length > 0 && (
              <ul className="bg-danger-soft max-h-40 overflow-y-auto rounded-lg p-2 text-xs">
                {result.errors.map((er) => (
                  <li key={er.line}>
                    Line {er.line}: {er.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
