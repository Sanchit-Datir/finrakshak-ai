import { BrainCircuit, Sparkles } from 'lucide-react';
import type { Application, Db } from '../../domain/schemas.js';
import {
  buildHeadline,
  documentLeads,
  MAX_LEADS,
  rankLeads,
  recordLeads,
  runStatus,
  type RunStatus,
} from '../../lib/ai-leads.js';
import type { Finding } from '../../lib/checks.js';
import { applicationDocs } from '../../lib/checks.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { Notice, SimulatedBadge } from '../ui/States.js';
import { AiAnalysisResult } from './AiAnalysisResult.js';
import { AiHalfSection } from './AiHalfSection.js';
import { AiLeadList } from './AiLeadList.js';
import { AttentionScoreView } from './AttentionScoreView.js';
import { InvestigationResult } from './InvestigationResult.js';
import { useAiOneClick, type Half } from './useAiOneClick.js';

const STATUS_TEXT: Record<RunStatus, string> = {
  both: 'Both ran: document analysis and public-record investigation.',
  documents: 'Documents only: the public-record investigation has no result.',
  investigator: 'Investigator only: the document analysis has no result.',
  none: 'Not run yet.',
};

const HALF_NAME: Record<Half, string> = {
  documents: 'document analysis',
  investigator: 'public-record investigation',
};

const PHASE_TEXT = {
  preparing: 'Preparing the public-records shortlists…',
  running: 'The investigation can take up to a minute.',
} as const;

/**
 * One button for the whole AI review (owner, 18 Oct 2026): runs analyseApplication and
 * investigateApplication together and shows a short, code-built headline and at most five leads, with
 * the full results one click away. Every run counts against the daily AI limit (B-15).
 */
export function AiOneClickCard({
  app,
  db,
  actor,
  findings,
  checksRun,
}: {
  app: Application;
  db: Db;
  actor: string;
  findings: readonly Finding[];
  checksRun: boolean;
}): React.JSX.Element {
  const auth = useCloudAuth();
  const ai = useAiOneClick(app, db, actor, findings, checksRun);
  const docs = applicationDocs(app, db);
  const a = app.aiAnalysis;
  const inv = app.aiInvestigation;
  const status = runStatus(a?.result ?? null, inv?.result ?? null);
  const leads = rankLeads([
    ...documentLeads(a?.result ?? null, findings),
    ...recordLeads(inv?.result ?? null, inv?.evidence ?? {}),
  ]);
  const failed = (['documents', 'investigator'] as const).filter((h) => ai.errors[h] !== null);
  const stale =
    (a !== null && a.inputsKey !== ai.analysisKey) ||
    (inv !== null && inv.inputsKey !== ai.investigationKey);
  const mock = (a?.result.mock ?? false) || (inv?.result.mock ?? false);
  const used =
    (a === null || a.result.mock ? 0 : 1) +
    (inv === null || inv.result.mock ? 0 : inv.result.modelCalls);
  const left = inv?.result.remainingToday ?? a?.result.remainingToday ?? null;
  const phaseText = ai.phase.investigator === 'idle' ? '' : PHASE_TEXT[ai.phase.investigator];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <BrainCircuit className="text-muted size-5" aria-hidden /> AI review
          </span>
        }
        subtitle="Gemini (server-side): document analysis and public-record investigation together"
      />
      <div className="space-y-4 px-5 pb-5">
        <AttentionScoreView attention={ai.attention} />
        {auth.status !== 'ready' ? (
          <Notice tone="warn" title="Not connected — no AI review ran">
            Sign in with a cloud account to run the AI review. In this session nothing is sent to an
            AI model and no AI result is shown.
          </Notice>
        ) : (
          <>
            <p className="text-muted text-xs">
              Sends the recorded fields (identity and account numbers masked), the check findings
              and a public-records shortlist made by code. Nothing is decided by the AI.
            </p>
            {ai.nothing && (
              <Notice title="Nothing to analyse yet">
                Fill in the application, add documents and run the checks first.
              </Notice>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={Sparkles}
                loading={ai.busy}
                disabled={ai.nothing || ai.busy}
                onClick={() => {
                  void ai.run(['documents', 'investigator']);
                }}
              >
                {status === 'none' && failed.length === 0 ? 'Analyse application' : 'Re-run both'}
              </Button>
              <span role="status" aria-live="polite" className="text-muted text-xs">
                {phaseText}
              </span>
            </div>
            <p className="text-muted tabular text-xs">
              One click uses 1 daily AI use for the documents plus 1 per model call of the
              investigator (up to 10), from your daily AI limit (30 by default).
              {used > 0 &&
                ` Last run used ${String(used)}${left === null ? '' : `; ${String(left)} left today`}.`}
            </p>
          </>
        )}
        {failed.map((h) => (
          <Notice key={h} tone="danger" title={`The ${HALF_NAME[h]} did not run`}>
            <p>{ai.errors[h]}</p>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              loading={ai.phase[h] !== 'idle'}
              disabled={ai.busy}
              onClick={() => {
                void ai.run([h]);
              }}
            >
              Retry {HALF_NAME[h]}
            </Button>
          </Notice>
        ))}
        {status !== 'none' && (
          <section aria-labelledby="ai-headline" className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h4 id="ai-headline" className="font-semibold">
                Summary
              </h4>
              {mock && <SimulatedBadge label="Simulated demo output — no model called" />}
              <span className="text-muted text-xs">{STATUS_TEXT[status]}</span>
            </div>
            {stale && (
              <Notice tone="warn" title="Out of date">
                The application or its findings changed after this review. Run it again to update
                it.
              </Notice>
            )}
            <p>{buildHeadline(leads, status)}</p>
            {leads.length > 0 && <AiLeadList leads={leads.slice(0, MAX_LEADS)} />}
            {leads.length > MAX_LEADS && (
              <p className="text-muted text-xs">
                {String(leads.length - MAX_LEADS)} more lead(s) are in the sections below.
              </p>
            )}
            <p className="text-muted text-xs">
              Leads for a reviewer, not decisions. Code checked every quoted fact and citation.
            </p>
          </section>
        )}
        {a !== null && (
          <AiHalfSection title="What the documents say" hint="Full analysis, quoted facts, notes">
            <AiAnalysisResult
              snapshot={a}
              docs={docs}
              findings={findings}
              stale={a.inputsKey !== ai.analysisKey}
            />
          </AiHalfSection>
        )}
        {inv !== null && (
          <AiHalfSection
            title="Public-record and plausibility leads"
            hint="Full findings, citations, draft questions"
          >
            <InvestigationResult
              app={app}
              actor={actor}
              snapshot={inv}
              stale={inv.inputsKey !== ai.investigationKey}
            />
          </AiHalfSection>
        )}
      </div>
    </Card>
  );
}
