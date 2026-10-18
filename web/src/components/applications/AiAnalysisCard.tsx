import { BrainCircuit, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Application, Db } from '../../domain/schemas.js';
import { analysisInputsKey, buildAnalysisRequest } from '../../lib/application-analysis.js';
import { applicationDocs, type Finding } from '../../lib/checks.js';
import { analyseApplication, explainAnalysisError } from '../../lib/cloud/application-analysis.js';
import { recordAiAnalysis } from '../../state/actions.js';
import { useCloudAuth } from '../../state/cloud-auth.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { Notice } from '../ui/States.js';
import { AiAnalysisResult } from './AiAnalysisResult.js';

/**
 * AI-assisted analysis of this application (analyseApplication). Runs only on a click: each run
 * counts against the person's daily AI limit (B-15). The last result is kept on the application and
 * marked out of date when the documents or findings change.
 */
export function AiAnalysisCard({
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
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docs = applicationDocs(app, db);
  const request = buildAnalysisRequest(app, docs, findings);
  const key = analysisInputsKey(request.input);
  const nothing = request.input.documents.length === 0 && request.input.findings.length === 0;
  const stored = app.aiAnalysis;

  const run = async (): Promise<void> => {
    if (auth.status !== 'ready') return;
    setRunning(true);
    setError(null);
    try {
      const result = await analyseApplication(auth.cloud, request.input);
      recordAiAnalysis(app.id, actor, {
        inputsKey: key,
        omittedDocuments: request.omittedDocuments,
        result,
      });
      toast.push({ tone: 'success', title: 'AI analysis ready' });
    } catch (e: unknown) {
      setError(explainAnalysisError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <BrainCircuit className="text-muted size-5" aria-hidden /> AI-assisted document analysis
          </span>
        }
        subtitle="Gemini (server-side, through the analyseApplication function)"
      />
      <div className="space-y-4 px-5 pb-5">
        {auth.status !== 'ready' ? (
          <Notice tone="warn" title="Not connected — no AI analysis ran">
            Sign in with a cloud account to run the AI analysis. In this session no document is sent
            to an AI model and no AI result is shown.
          </Notice>
        ) : (
          <>
            <p className="text-muted text-xs">
              Sends the recorded document fields (identity and account numbers masked) and the check
              findings. Nothing is decided by the AI.
            </p>
            {nothing && (
              <Notice title="Nothing to analyse yet">Add documents or run the checks first.</Notice>
            )}
            {error !== null && (
              <Notice tone="danger" title="The AI analysis did not run">
                {error}
              </Notice>
            )}
            <Button
              variant="primary"
              icon={Sparkles}
              loading={running}
              disabled={nothing || running}
              onClick={() => {
                void run();
              }}
            >
              {error !== null
                ? 'Try again'
                : stored === null
                  ? 'Analyse with Gemini'
                  : 'Re-run analysis'}
            </Button>
          </>
        )}
        {stored !== null && (
          <AiAnalysisResult
            snapshot={stored}
            docs={docs}
            findings={findings}
            stale={stored.inputsKey !== key}
          />
        )}
      </div>
    </Card>
  );
}
