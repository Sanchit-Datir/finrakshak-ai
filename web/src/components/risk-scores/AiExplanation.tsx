import { AI_EXPLANATION_LABEL, reasonText } from '@fund-tracker/shared';
import { Sparkles } from 'lucide-react';
import type { ExplainedAlert } from '../../lib/cloud/risk-scores.js';
import { useFormat } from '../../state/hooks.js';

/**
 * The risk explainer's sentence (RISK_EXPLAINER_PLAN.md, design 5; B-62): always labelled as AI-written,
 * always followed by the recorded reasons it summarises. The reasons are the record; if they and the
 * sentence ever disagree, the reasons are right.
 */
export function AiExplanation({ explained }: { explained: ExplainedAlert }): React.JSX.Element {
  const f = useFormat();
  const { alert, explanation } = explained;
  return (
    <section aria-labelledby="risk-ai-summary" className="card space-y-2 p-3">
      <h3 id="risk-ai-summary" className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="text-violet size-4" aria-hidden />
        {AI_EXPLANATION_LABEL}
      </h3>
      <p className="text-sm">{explanation.text}</p>
      <p className="text-muted text-xs">
        Alert of {f.date(alert.as_of)} · written by {explanation.model} (
        {explanation.prompt_version}) from these recorded reasons, which are the record:
      </p>
      <ul className="text-muted list-disc space-y-1 pl-5 text-xs">
        {alert.reasons.map((r) => (
          <li key={r.reason_key}>{reasonText(r)}</li>
        ))}
      </ul>
    </section>
  );
}
