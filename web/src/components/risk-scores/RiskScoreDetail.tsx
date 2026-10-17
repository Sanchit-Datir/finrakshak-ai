import { RISK_BAND_LABELS, reasonText, type RiskScoreView } from '@fund-tracker/shared';
import { Badge } from '../ui/Badge.js';
import { Dialog } from '../ui/Dialog.js';
import { Notice } from '../ui/States.js';
import { PriorityBadge } from '../ui/StatusBadges.js';
import { useFormat } from '../../state/hooks.js';
import type { ExplainedAlert } from '../../lib/cloud/risk-scores.js';
import { AiExplanation } from './AiExplanation.js';
import { ALERT_KIND_LABEL, LAYER_LABEL } from './labels.js';

/** One synthetic loan's latest score: band, points per layer, reasons and the "what changed" block. */
export function RiskScoreDetail({
  score,
  explained,
  onClose,
}: {
  score: RiskScoreView | null;
  /** The loan's latest alert with its AI sentence, when the explainer wrote one. */
  explained: ExplainedAlert | null;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Dialog
      open={score !== null}
      onClose={onClose}
      variant="drawer"
      title={score === null ? 'Risk score' : `Risk score · ${score.loan_id}`}
      description="SYNTH test loan. A score is a lead for review, never a verdict."
    >
      {score !== null && <DetailBody score={score} explained={explained} />}
    </Dialog>
  );
}

function DetailBody({
  score,
  explained,
}: {
  score: RiskScoreView;
  explained: ExplainedAlert | null;
}): React.JSX.Element {
  const f = useFormat();
  const s = score.latest;
  const reasons = s.reasons.filter((r) => r.points > 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={score.held_band} />
        <span className="tabular text-2xl font-semibold">{s.score}</span>
        <span className="text-muted text-sm">of 100</span>
        {score.alert_kind !== 'none' && (
          <Badge tone="warn">{ALERT_KIND_LABEL[score.alert_kind]}</Badge>
        )}
      </div>
      {s.stale_inputs && (
        <Notice tone="warn" title="Stale or missing inputs">
          The public data was built on {f.date(s.data_built_on)}. A lower score is not shown as an
          improvement, and stale is not low risk.
        </Notice>
      )}
      {s.no_patterns && (
        <Notice tone="warn" title="Patterns not checked">
          No approved patterns were available, so the pattern layer scored 0; that 0 is not low
          risk.
        </Notice>
      )}
      {explained !== null && <AiExplanation explained={explained} />}
      <section aria-labelledby="risk-points">
        <h3 id="risk-points" className="mb-2 text-sm font-semibold">
          Points by layer
        </h3>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {(['direct', 'pattern', 'graph', 'behaviour'] as const).map((layer) => (
            <div key={layer} className="card p-2">
              <dt className="text-muted text-xs">{LAYER_LABEL[layer]}</dt>
              <dd className="tabular font-semibold">{s.points[layer]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="risk-reasons">
        <h3 id="risk-reasons" className="mb-2 text-sm font-semibold">
          Reasons ({reasons.length})
        </h3>
        {reasons.length === 0 ? (
          <p className="text-muted text-sm">No reason carries points in this run.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reasons.map((r) => (
              <li key={r.reason_key} className="card p-2">
                <p>{reasonText(r)}</p>
                <p className="text-muted mt-1 text-xs">
                  {LAYER_LABEL[r.layer]} · evidence as found: {r.evidence_statuses.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="risk-change">
        <h3 id="risk-change" className="mb-2 text-sm font-semibold">
          What changed since the last check
        </h3>
        <pre className="card text-ink/90 p-3 font-sans text-[13px] whitespace-pre-wrap">
          {score.change_text}
        </pre>
      </section>
      <dl className="text-muted grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt>Scored on (IST)</dt>
        <dd>{f.date(score.as_of)}</dd>
        <dt>Public data built on</dt>
        <dd>{f.date(s.data_built_on)}</dd>
        <dt>Settings version</dt>
        <dd>{s.settings_version}</dd>
        <dt>Pattern library version</dt>
        <dd>{s.pattern_version ?? 'None'}</dd>
        <dt>Band of this run</dt>
        <dd>{RISK_BAND_LABELS[s.band]}</dd>
      </dl>
    </div>
  );
}
