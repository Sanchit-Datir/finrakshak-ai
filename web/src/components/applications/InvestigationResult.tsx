import type { InvestigateApplicationResult } from '@fund-tracker/shared';
import { REJECTION_LABEL } from '../../domain/labels.js';
import type { AiInvestigationSnapshot, Application } from '../../domain/schemas.js';
import { useFormat } from '../../state/hooks.js';
import { Notice, SimulatedBadge } from '../ui/States.js';
import { InvestigationFindingItem } from './InvestigationFindingItem.js';
import { InvestigationQuestionItem } from './InvestigationQuestionItem.js';

function ClaimsLine({ r }: { r: InvestigateApplicationResult }): React.JSX.Element {
  const { made, verified, rejected } = r.claims;
  return (
    <div className="border-line rounded-lg border p-3 text-xs">
      <p className="tabular text-sm font-medium">
        AI made {made} claim{made === 1 ? '' : 's'}: {verified} verified, {rejected} rejected
      </p>
      {r.rejections.length > 0 && (
        <ul className="text-muted mt-1 list-disc pl-5">
          {r.rejections.map((x) => (
            <li key={x.reason}>
              <span className="tabular">{x.count}</span> {REJECTION_LABEL[x.reason]}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted mt-1">
        Rejected claims are not shown and add nothing to the attention score.
      </p>
    </div>
  );
}

/** A stored investigation. All model text is plain React text (escaped), never HTML. */
export function InvestigationResult({
  app,
  actor,
  snapshot,
  stale,
}: {
  app: Application;
  actor: string;
  snapshot: AiInvestigationSnapshot;
  stale: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const r = snapshot.result;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {r.mock ? (
          <SimulatedBadge label="Mock provider — no model called" />
        ) : (
          <span className="text-muted text-xs">AI-proposed by {r.model}, checked by code</span>
        )}
        <span className="text-muted text-xs">{f.dateTime(r.investigatedAt)}</span>
        {!r.mock && (
          <span className="text-muted tabular text-xs">
            {r.modelCalls} model call{r.modelCalls === 1 ? '' : 's'} counted against your daily AI
            limit
            {r.remainingToday === null ? '' : ` (${String(r.remainingToday)} left today)`}
          </span>
        )}
      </div>
      {r.stoppedAtDailyLimit && (
        <Notice tone="warn" title="Stopped at your daily AI limit">
          The investigation stopped before it finished, so the limit was not crossed. The findings
          below were verified before it stopped; run it again tomorrow for a complete result.
        </Notice>
      )}
      {stale && (
        <Notice tone="warn" title="Out of date">
          The application or its findings changed after this investigation. Its findings no longer
          count in the attention score. Run it again to update it.
        </Notice>
      )}
      {r.mock && (
        <Notice title="Mock findings do not count">
          These were scripted by code to exercise the checks. They add nothing to the attention
          score.
        </Notice>
      )}
      {!snapshot.publicRecordsLoaded && (
        <Notice tone="warn" title="Public records were not loaded">
          No public-record candidates or links were sent, so no public-record match could be raised.
        </Notice>
      )}
      <ClaimsLine r={r} />
      <section aria-labelledby="inv-summary">
        <h4 id="inv-summary" className="mb-1 font-semibold">
          Summary
        </h4>
        <p>
          {r.summary === '' ? 'No summary (missing, or withheld by the wording check).' : r.summary}
        </p>
        {r.notEnoughEvidence && (
          <p className="text-muted mt-1 text-xs">
            The investigator reported that the data does not hold enough evidence to raise a lead.
          </p>
        )}
      </section>
      <section aria-labelledby="inv-findings">
        <h4 id="inv-findings" className="mb-1 font-semibold">
          Verified findings
        </h4>
        {r.findings.length === 0 ? (
          <p className="text-muted">No finding passed verification.</p>
        ) : (
          <ul className="space-y-3">
            {r.findings.map((x) => (
              <InvestigationFindingItem
                key={x.id}
                app={app}
                actor={actor}
                finding={x}
                investigatedAt={r.investigatedAt}
                evidence={snapshot.evidence}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="inv-questions">
        <h4 id="inv-questions" className="mb-1 font-semibold">
          Draft questions for the applicant
        </h4>
        {r.questions.length === 0 ? (
          <p className="text-muted">No questions drafted.</p>
        ) : (
          <ul className="space-y-3">
            {r.questions.map((q) => (
              <InvestigationQuestionItem
                key={q.id}
                appId={app.id}
                actor={actor}
                question={q}
                gapLabel={snapshot.evidence[`field:${q.gap}`]?.label ?? q.gap}
                approved={snapshot.approved[q.id] ?? null}
                disabled={stale}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
