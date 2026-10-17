import { RISK_BANDS, type RiskScoreView } from '@fund-tracker/shared';
import { Gauge } from 'lucide-react';
import { Link } from 'react-router';
import { RiskScoreDetail } from '../components/risk-scores/RiskScoreDetail.js';
import { ALERT_KIND_LABEL } from '../components/risk-scores/labels.js';
import { Badge } from '../components/ui/Badge.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, ErrorState, Notice, Skeleton } from '../components/ui/States.js';
import { PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { latestExplained, type RiskScores } from '../lib/cloud/risk-scores.js';
import { useFormat } from '../state/hooks.js';
import { useUrlState } from '../state/url.js';
import { useRiskScores } from '../state/useRiskScores.js';

/**
 * Synthetic risk scores (REMAINING_WORK.md, W3c; question Q4: a page of its own, because these SYNTH
 * loans are not the demo loan book). Scores come from the getRiskScores function when signed in with a
 * profile, else from the bundled sample. A score is a lead for review, never a verdict (B-58).
 */
export function RiskScoresPage(): React.JSX.Element {
  const state = useRiskScores();
  return (
    <div className="space-y-6">
      <PageHeader
        docTitle="Risk scores"
        title="Risk scores"
        subtitle="Daily scores of synthetic test loans: public records, patterns, related parties and repayment behaviour."
        badge={<Badge tone="violet">Synthetic test data</Badge>}
      />
      <Notice title="SYNTH test loans only">
        Every loan and name here is fictional (B-54). The scores show that the scoring works end to
        end; they say nothing about real borrowers. A band is a lead for review, never a finding of
        wrongdoing. See also <Link to="/alerts?source=risk_score">risk score alerts</Link>.
      </Notice>
      {state.status === 'loading' && (
        <div role="status" aria-label="Loading risk scores" className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {state.status === 'error' && (
        <Card>
          <ErrorState title="The risk scores could not be loaded" onRetry={state.retry}>
            {state.message}
          </ErrorState>
        </Card>
      )}
      {state.status === 'ready' && <Scores data={state.data} />}
    </div>
  );
}

function Scores({ data }: { data: RiskScores }): React.JSX.Element {
  const f = useFormat();
  const [loan, setLoan] = useUrlState('loan', '');
  const open = data.scores.find((s) => s.loan_id === loan) ?? null;
  if (data.scores.length === 0)
    return (
      <Card>
        <EmptyState icon={Gauge} title="No risk scores yet">
          The daily scoring job has not written any scores. It is off until the owner&apos;s dry
          run.
        </EmptyState>
      </Card>
    );
  return (
    <>
      <p className="text-muted text-sm">
        {data.origin === 'sample'
          ? 'Bundled sample: the scoring core run over 10 SYNTH loans for 24 months. Not connected to the cloud job.'
          : 'From the daily scoring job.'}
        {data.truncated && ' Showing the first page only.'}
        {data.dropped > 0 && ` ${data.dropped} malformed item(s) were not shown.`}
      </p>
      <BandCounts scores={data.scores} />
      <Card>
        <CardHeader title="Latest score per loan" subtitle="Select a loan to see its reasons." />
        <DataTable
          caption="Latest risk score per synthetic loan"
          rows={data.scores}
          rowKey={(s) => s.loan_id}
          initialSort={{ key: 'score', dir: 'desc' }}
          columns={[
            {
              key: 'loan',
              header: 'Loan',
              sortValue: (s) => s.loan_id,
              render: (s) => (
                <button
                  type="button"
                  className="text-primary text-left font-semibold whitespace-nowrap hover:underline"
                  onClick={() => {
                    setLoan(s.loan_id);
                  }}
                >
                  {s.loan_id}
                </button>
              ),
            },
            { key: 'borrower', header: 'Borrower', render: (s) => s.borrower_id },
            {
              key: 'band',
              header: 'Band',
              render: (s) => <PriorityBadge priority={s.held_band} />,
            },
            {
              key: 'score',
              header: 'Score',
              align: 'right',
              sortValue: (s) => s.latest.score,
              render: (s) => <span className="tabular">{s.latest.score}</span>,
            },
            {
              key: 'delta',
              header: 'Change',
              align: 'right',
              render: (s) => <span className="tabular">{deltaText(s.delta)}</span>,
            },
            { key: 'alert', header: 'Last run', render: (s) => ALERT_KIND_LABEL[s.alert_kind] },
            { key: 'asof', header: 'Scored on', render: (s) => f.date(s.as_of) },
            {
              key: 'data',
              header: 'Public data',
              render: (s) =>
                s.latest.stale_inputs ? (
                  <Badge tone="warn">Stale since {f.date(s.latest.data_built_on)}</Badge>
                ) : (
                  f.date(s.latest.data_built_on)
                ),
            },
          ]}
        />
      </Card>
      <RiskScoreDetail
        score={open}
        explained={open === null ? null : latestExplained(data, open.loan_id)}
        onClose={() => {
          setLoan('');
        }}
      />
    </>
  );
}

const deltaText = (d: number | null): string => (d === null ? 'First' : d > 0 ? `+${d}` : `${d}`);

function BandCounts({ scores }: { scores: readonly RiskScoreView[] }): React.JSX.Element {
  return (
    <ul className="grid gap-3 sm:grid-cols-3" aria-label="Loans by band">
      {[...RISK_BANDS].reverse().map((band) => (
        <li key={band} className="card flex items-center justify-between p-4">
          <PriorityBadge priority={band} />
          <span className="tabular text-2xl font-semibold">
            {scores.filter((s) => s.held_band === band).length}
          </span>
        </li>
      ))}
    </ul>
  );
}
