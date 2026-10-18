import { ScanSearch, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Application, Db } from '../../domain/schemas.js';
import type { Finding } from '../../lib/checks.js';
import {
  explainInvestigationError,
  investigateApplication,
} from '../../lib/cloud/application-investigation.js';
import {
  buildInvestigationBundle,
  investigationCore,
  investigationInputsKey,
} from '../../lib/investigation-bundle.js';
import { evidenceIndex } from '../../lib/investigation-evidence.js';
import type { LabIndex } from '../../lib/graph-lab.js';
import { loadPublicRecords } from '../../lib/public-records.js';
import { recordAiInvestigation } from '../../state/actions.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { Notice } from '../ui/States.js';
import { InvestigationResult } from './InvestigationResult.js';

type Phase = 'idle' | 'preparing' | 'investigating';

const PHASE_TEXT: Record<Phase, string> = {
  idle: '',
  preparing: 'Preparing the data: ratios and public-records shortlists…',
  investigating: 'Investigating. This can take up to a minute.',
};

async function publicRecordsOrNull(): Promise<LabIndex | null> {
  try {
    return await loadPublicRecords();
  } catch {
    // Reported on the card: the investigation runs without public-record candidates.
    return null;
  }
}

/**
 * The AI investigator (investigateApplication): on a click, Gemini investigates the typed-in
 * application through a closed set of tools and code verifies every claim. Each run counts against
 * the daily AI limit (B-15). The last result is kept on the application and marked out of date when
 * the application data or the findings change.
 */
export function AiInvestigatorCard({
  app,
  db,
  actor,
  findings,
}: {
  app: Application;
  db: Db;
  actor: string;
  findings: readonly Finding[];
}): React.JSX.Element {
  const auth = useCloudAuth();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const key = investigationInputsKey(app, findings);
  const core = investigationCore(app, findings);
  const nothing = Object.values(core.sections).every((s) => s.every((x) => x.value === ''));
  const stored = app.aiInvestigation;
  const busy = phase !== 'idle';

  const run = async (): Promise<void> => {
    if (auth.status !== 'ready') return;
    setError(null);
    setPhase('preparing');
    try {
      const ix = await publicRecordsOrNull();
      const input = buildInvestigationBundle(app, db, findings, ix);
      setPhase('investigating');
      const result = await investigateApplication(auth.cloud, input);
      recordAiInvestigation(app.id, actor, {
        inputsKey: key,
        evidence: evidenceIndex(input, result),
        publicRecordsLoaded: ix !== null,
        result,
      });
      toast.push({ tone: 'success', title: 'AI investigation ready' });
    } catch (e: unknown) {
      setError(explainInvestigationError(e));
    } finally {
      setPhase('idle');
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ScanSearch className="text-muted size-5" aria-hidden /> AI investigator
          </span>
        }
        subtitle="Gemini (server-side, through the investigateApplication function)"
      />
      <div className="space-y-4 px-5 pb-5">
        <p className="text-muted text-xs">
          Gemini reads the typed-in application (identity numbers masked), ratios computed by code,
          a public-records shortlist made by code and related entities, and proposes leads with
          cited evidence. Code checks every citation, quoted value and number and rejects anything
          that does not match. Nothing is decided by the AI.
        </p>
        {auth.status !== 'ready' ? (
          <Notice tone="warn" title="Not connected — no AI investigation ran">
            Sign in with a cloud account to run the AI investigator. In this session nothing is sent
            to an AI model and no AI result is shown.
          </Notice>
        ) : (
          <>
            {nothing && (
              <Notice title="Nothing to investigate yet">
                Fill in the application form first.
              </Notice>
            )}
            {error !== null && (
              <Notice tone="danger" title="The AI investigation did not run">
                {error}
              </Notice>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={Sparkles}
                loading={busy}
                disabled={nothing || busy}
                onClick={() => {
                  void run();
                }}
              >
                {error !== null
                  ? 'Try again'
                  : stored === null
                    ? 'Investigate with AI'
                    : 'Re-run investigation'}
              </Button>
              <span role="status" aria-live="polite" className="text-muted text-xs">
                {PHASE_TEXT[phase]}
              </span>
            </div>
          </>
        )}
        {stored !== null && (
          <InvestigationResult
            app={app}
            actor={actor}
            snapshot={stored}
            stale={stored.inputsKey !== key}
          />
        )}
      </div>
    </Card>
  );
}
