import { PRIORITY_LABEL } from '../../domain/labels.js';
import type { Priority } from '../../domain/schemas.js';
import { ATTENTION_MAX, type AttentionScore } from '../../lib/attention-score.js';
import { PriorityBadge } from '../ui/StatusBadges.js';

const BAR: Record<Priority, string> = {
  routine: 'bg-ok',
  needs_attention: 'bg-warn',
  urgent: 'bg-danger',
};

/** The code-computed attention score: number, band (badge with icon and text), meter and drivers. */
export function AttentionScoreView({
  attention,
}: {
  attention: AttentionScore | null;
}): React.JSX.Element {
  if (attention === null)
    return <p className="text-muted text-sm">Run the checks to calculate the attention score.</p>;
  const { score, band, drivers, counted } = attention;
  return (
    <section aria-labelledby="attention-score" className="border-line rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h4 id="attention-score" className="text-sm font-semibold">
          Attention score
        </h4>
        <span className="tabular text-2xl font-semibold">
          {score}
          <span className="text-muted text-sm font-normal"> / {ATTENTION_MAX}</span>
        </span>
        <PriorityBadge priority={band} />
      </div>
      <div
        role="meter"
        aria-label="Attention score"
        aria-valuemin={0}
        aria-valuemax={ATTENTION_MAX}
        aria-valuenow={score}
        aria-valuetext={`${String(score)} of ${String(ATTENTION_MAX)}, ${PRIORITY_LABEL[band]}`}
        className="bg-line mt-2 h-2 overflow-hidden rounded-full"
      >
        <div className={`${BAR[band]} h-full`} style={{ width: `${String(score)}%` }} />
      </div>
      {drivers.length === 0 ? (
        <p className="text-muted mt-2 text-xs">No unresolved findings.</p>
      ) : (
        <ul className="mt-2 space-y-0.5 text-xs">
          {drivers.map((d) => (
            <li key={d.findingId} className="flex justify-between gap-3">
              <span>{d.title}</span>
              <span className="tabular text-muted shrink-0">+{d.points}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted mt-2 text-xs">
        Calculated by code from {counted} unresolved finding(s): urgent 60, needs attention 30,
        routine 10, up to 100. A guide to how much attention this case needs, not a probability or a
        decision.
      </p>
    </section>
  );
}
