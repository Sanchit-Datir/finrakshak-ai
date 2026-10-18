import type { InvestigationFinding } from '@finrakshak-ai/shared';
import { BadgeCheck, CircleHelp, ShieldCheck } from 'lucide-react';
import { AI_FINDING_KIND_LABEL, AI_FINDING_SOURCE_LABEL } from '../../domain/labels.js';
import type { Application, InvestigationEvidence } from '../../domain/schemas.js';
import { aiPointsOf } from '../../lib/attention-score.js';
import { aiFindingStateId, citationKey } from '../../lib/investigation-evidence.js';
import { setFindingStatus } from '../../state/actions.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { PriorityBadge } from '../ui/StatusBadges.js';

function MatchBadge({ match }: { match: InvestigationFinding['match'] }): React.JSX.Element | null {
  if (match === null) return null;
  return match === 'strong' ? (
    <Badge tone="warn" icon={BadgeCheck}>
      CIN or address agrees
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CircleHelp}>
      Possible match — needs verification
    </Badge>
  );
}

/** One verified AI finding with the evidence code checked, and dismiss / restore. */
export function InvestigationFindingItem({
  app,
  actor,
  finding,
  investigatedAt,
  evidence,
}: {
  app: Application;
  actor: string;
  finding: InvestigationFinding;
  investigatedAt: string;
  evidence: Readonly<Record<string, InvestigationEvidence>>;
}): React.JSX.Element {
  const stateId = aiFindingStateId(investigatedAt, finding);
  const dismissed = app.findingStates[stateId]?.status === 'not_an_issue';
  return (
    <li className="border-line rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{AI_FINDING_KIND_LABEL[finding.kind]}</span>
        <PriorityBadge priority={finding.priority} />
        <MatchBadge match={finding.match} />
      </div>
      <p className="text-muted mt-1 text-xs">
        <ShieldCheck className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {AI_FINDING_SOURCE_LABEL} · up to <span className="tabular">+{aiPointsOf(finding)}</span> on
        the attention score
      </p>
      <p className={dismissed ? 'text-muted mt-2 line-through' : 'mt-2'}>{finding.statement}</p>
      <h5 className="mt-2 text-xs font-semibold">Evidence (checked by code)</h5>
      <ul className="mt-1 space-y-0.5 text-xs break-words">
        {finding.citations.map((c) => {
          const k = citationKey(c);
          const e = evidence[k];
          return (
            <li key={k}>
              <span className="font-medium">{e?.label ?? k}</span>
              {e !== undefined && <span className="text-muted">: {e.detail}</span>}
              {c.type === 'field' && c.quote !== null && (
                <span className="text-muted"> (quoted “{c.quote}”)</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setFindingStatus(
              app.id,
              stateId,
              actor,
              dismissed ? 'needs_review' : 'not_an_issue',
              dismissed ? 'AI finding restored' : 'AI finding dismissed after review',
            );
          }}
        >
          {dismissed ? 'Restore finding' : 'Dismiss (not an issue)'}
        </Button>
        {dismissed && <span className="text-muted ml-2 text-xs">Dismissed: adds nothing.</span>}
      </div>
    </li>
  );
}
