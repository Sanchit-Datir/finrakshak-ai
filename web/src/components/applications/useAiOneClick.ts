import { useState } from 'react';
import type { Application, Db } from '../../domain/schemas.js';
import { analysisInputsKey, buildAnalysisRequest } from '../../lib/application-analysis.js';
import {
  aiFindingsForScore,
  attentionScore,
  type AttentionScore,
} from '../../lib/attention-score.js';
import { applicationDocs, type Finding } from '../../lib/checks.js';
import { analyseApplication, explainAnalysisError } from '../../lib/cloud/application-analysis.js';
import {
  explainInvestigationError,
  investigateApplication,
} from '../../lib/cloud/application-investigation.js';
import type { LabIndex } from '../../lib/graph-lab.js';
import {
  buildInvestigationBundle,
  investigationCore,
  investigationInputsKey,
} from '../../lib/investigation-bundle.js';
import { evidenceIndex } from '../../lib/investigation-evidence.js';
import { loadPublicRecords } from '../../lib/public-records.js';
import { recordAiAnalysis, recordAiInvestigation } from '../../state/actions.js';
import { useCloudAuth } from '../../state/cloud-auth.js';

export type Half = 'documents' | 'investigator';
export type Phase = 'idle' | 'preparing' | 'running';

async function publicRecordsOrNull(): Promise<LabIndex | null> {
  try {
    return await loadPublicRecords();
  } catch {
    // Reported in the result: the investigation runs without public-record candidates.
    return null;
  }
}

export interface AiOneClick {
  readonly attention: AttentionScore | null;
  readonly nothing: boolean;
  readonly phase: Record<Half, Phase>;
  readonly errors: Record<Half, string | null>;
  readonly busy: boolean;
  readonly analysisKey: string;
  readonly investigationKey: string;
  readonly omittedDocuments: number;
  run: (halves: readonly Half[]) => Promise<void>;
}

/**
 * Runs the document analysis and the investigator for one application. The halves are independent
 * callables with their own burst limits (analyse 3/min, investigate 2/min), so they run in parallel;
 * one failing never discards the other. Each half records its own audit entry (recordAi*).
 */
export function useAiOneClick(
  app: Application,
  db: Db,
  actor: string,
  findings: readonly Finding[],
  checksRun: boolean,
): AiOneClick {
  const auth = useCloudAuth();
  const [phase, setPhase] = useState<Record<Half, Phase>>({
    documents: 'idle',
    investigator: 'idle',
  });
  const [errors, setErrors] = useState<Record<Half, string | null>>({
    documents: null,
    investigator: null,
  });
  const docs = applicationDocs(app, db);
  const invKey = investigationInputsKey(app, findings);
  const ai = aiFindingsForScore(app.aiInvestigation, invKey);
  const attention = checksRun ? attentionScore(app, findings, ai) : null;
  const request = buildAnalysisRequest(app, docs, findings, attention);
  const core = investigationCore(app, findings);
  const nothing =
    (request.input.documents.length === 0 && request.input.findings.length === 0) ||
    Object.values(core.sections).every((s) => s.every((x) => x.value === ''));
  const set = (h: Half, p: Phase, e: string | null): void => {
    setPhase((s) => ({ ...s, [h]: p }));
    setErrors((s) => ({ ...s, [h]: e }));
  };

  const runDocuments = async (): Promise<void> => {
    if (auth.status !== 'ready') return;
    set('documents', 'running', null);
    try {
      const result = await analyseApplication(auth.cloud, request.input);
      recordAiAnalysis(app.id, actor, {
        inputsKey: analysisInputsKey(request.input),
        omittedDocuments: request.omittedDocuments,
        result,
      });
      set('documents', 'idle', null);
    } catch (e: unknown) {
      set('documents', 'idle', explainAnalysisError(e));
    }
  };

  const runInvestigator = async (): Promise<void> => {
    if (auth.status !== 'ready') return;
    set('investigator', 'preparing', null);
    try {
      const ix = await publicRecordsOrNull();
      const input = buildInvestigationBundle(app, db, findings, ix);
      setPhase((s) => ({ ...s, investigator: 'running' }));
      const result = await investigateApplication(auth.cloud, input);
      recordAiInvestigation(app.id, actor, {
        inputsKey: invKey,
        evidence: evidenceIndex(input, result),
        publicRecordsLoaded: ix !== null,
        result,
      });
      set('investigator', 'idle', null);
    } catch (e: unknown) {
      set('investigator', 'idle', explainInvestigationError(e));
    }
  };

  const run = async (halves: readonly Half[]): Promise<void> => {
    await Promise.all([
      halves.includes('documents') ? runDocuments() : Promise.resolve(),
      halves.includes('investigator') ? runInvestigator() : Promise.resolve(),
    ]);
  };

  return {
    attention,
    nothing,
    phase,
    errors,
    busy: phase.documents !== 'idle' || phase.investigator !== 'idle',
    analysisKey: analysisInputsKey(request.input),
    investigationKey: invKey,
    omittedDocuments: request.omittedDocuments,
    run,
  };
}
