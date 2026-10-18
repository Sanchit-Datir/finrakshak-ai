import { RISK_BAND_LABELS, type RiskHistoryPoint } from '@finrakshak-ai/shared';
import { Sparkline } from '../charts/Sparkline.js';
import { summariseTrend } from '../../lib/risk-score-view.js';
import { useFormat } from '../../state/hooks.js';
import { SimulatedBadge } from '../ui/States.js';

/**
 * Month-end scores of one loan. Only the bundled sample has history; the cloud reader does not exist
 * yet, so it says so instead of showing an empty chart. A rise is a lead for review, never a verdict (B-58).
 */
export function ScoreHistory({
  history,
  fromSample,
}: {
  history: readonly RiskHistoryPoint[];
  fromSample: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const trend = summariseTrend(history);
  return (
    <section aria-labelledby="risk-history">
      <h3 id="risk-history" className="mb-2 flex items-center gap-2 text-sm font-semibold">
        Score over time
        {fromSample && <SimulatedBadge label="Sample history" />}
      </h3>
      {trend === null ? (
        <p className="text-muted text-sm">
          {fromSample
            ? 'This loan has fewer than two scored months.'
            : 'Score history is not available from the cloud yet. It is kept in the scoring job’s archive, which the app does not read.'}
        </p>
      ) : (
        <div className="space-y-2">
          <Sparkline values={history.map((p) => p.score)} className="h-12 w-full" />
          <p className="text-sm">
            {trend.points} month-end runs, {f.date(trend.first.as_of)} to {f.date(trend.last.as_of)}
            : {trend.first.score} to {trend.last.score} (
            <span className="tabular">{trend.change > 0 ? `+${trend.change}` : trend.change}</span>
            ), highest {trend.peak.score} on {f.date(trend.peak.as_of)}; the band went up{' '}
            {trend.bandRises} {trend.bandRises === 1 ? 'time' : 'times'}.
          </p>
          <details className="text-sm">
            <summary className="text-primary cursor-pointer">Show the months as a table</summary>
            <table className="mt-2 w-full text-left text-xs">
              <caption className="sr-only">Month-end scores of this loan</caption>
              <thead>
                <tr>
                  <th scope="col">Scored on</th>
                  <th scope="col">Band</th>
                  <th scope="col" className="text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((p) => (
                  <tr key={p.as_of}>
                    <td>{f.date(p.as_of)}</td>
                    <td>{RISK_BAND_LABELS[p.held_band]}</td>
                    <td className="tabular text-right">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </section>
  );
}
