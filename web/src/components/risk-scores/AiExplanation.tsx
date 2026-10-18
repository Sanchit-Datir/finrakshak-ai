import { AI_EXPLANATION_LABEL, reasonText } from '@finrakshak-ai/shared';
import { Sparkles } from 'lucide-react';
import { SimulatedBadge } from '../ui/States.js';
import type { ExplainedAlert } from '../../lib/cloud/risk-scores.js';
import { useFormat } from '../../state/hooks.js';

/**
 * The risk explainer's sentence (RISK_EXPLAINER_PLAN.md, design 5; B-62): always labelled as AI-written,
 * always followed by the recorded reasons it summarises. The reasons are the record; if they and the
 * sentence ever disagree, the reasons are right.
 */
export function AiExplanation({
  explained,
  simulated,
}: {
  explained: ExplainedAlert;
  /** Sentence comes from the bundled sample, not from a model. */
  simulated: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const { alert, explanation } = explained;
  return (
    <section aria-labelledby="risk-ai-summary" className="card space-y-2 p-3">
      <h3 id="risk-ai-summary" className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="text-violet size-4" aria-hidden />
        {simulated ? 'Summary of the recorded reasons' : AI_EXPLANATION_LABEL}
        {simulated && <SimulatedBadge label="Simulated demo output" />}
      </h3>
      <p className="text-sm">{explanation.text}</p>
      <p className="text-muted text-xs">
        Alert of {f.date(alert.as_of)} ·{' '}
        {simulated
          ? 'written by hand for the bundled sample, not by a model, from'
          : `written by ${explanation.model} (${explanation.prompt_version}) from`}{' '}
        these recorded reasons, which are the record:
      </p>
      <ul className="text-muted list-disc space-y-1 pl-5 text-xs">
        {alert.reasons.map((r) => (
          <li key={r.reason_key}>{reasonText(r)}</li>
        ))}
      </ul>
    </section>
  );
}
