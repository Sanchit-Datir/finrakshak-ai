/** Results stored on an application: public-records check, AI analysis and AI investigation. */

import type {
  PublicRecordsSnapshot,
  AiAnalysisSnapshot,
  AiInvestigationSnapshot,
} from '../../domain/schemas.js';
import { mutate, nowIso, uid } from '../store.js';
import { audit, findApp } from './internal.js';

/** Saves the facts a public-records check found, so findings are reproducible and audited. */
export function recordPublicRecordsCheck(
  appId: string,
  actor: string,
  snapshot: PublicRecordsSnapshot,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    a.publicRecords = snapshot;
    const found = snapshot.exposures.length;
    a.audit.push(
      audit(
        actor,
        'Public-records check run',
        `Local dataset built ${snapshot.datasetBuiltAt?.slice(0, 10) ?? 'unknown'}; ` +
          `${snapshot.customersChecked.length} customer(s) checked; ` +
          `${found} customer(s) in insolvency or liquidation`,
      ),
    );
  });
}

/** Stores the AI investigation on the application (one audit entry; counts only, no AI text). */
export function recordAiInvestigation(
  appId: string,
  actor: string,
  snapshot: Omit<AiInvestigationSnapshot, 'approved'>,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    a.aiInvestigation = { ...snapshot, approved: {} };
    const r = snapshot.result;
    a.audit.push(
      audit(
        actor,
        r.mock ? 'AI investigation run (mock, no model called)' : 'AI investigation run',
        `${r.model ?? 'mock provider'}; ${r.claims.made} claim(s): ${r.claims.verified} verified, ` +
          `${r.claims.rejected} rejected by code`,
      ),
    );
  });
}

/** An officer approves (and may edit) a draft question: it is recorded as a note, nothing is sent. */
export function approveInvestigationQuestion(
  appId: string,
  actor: string,
  questionId: string,
  text: string,
): void {
  mutate((d) => {
    const a = findApp(d, appId);
    if (a.aiInvestigation === null) return;
    const at = nowIso();
    a.aiInvestigation.approved[questionId] = { text, by: actor, at };
    a.notes.push({
      id: uid('n'),
      author: actor,
      at,
      text: `Information request (drafted with AI, approved): ${text}`,
    });
    a.audit.push(audit(actor, 'AI-drafted question approved', text.slice(0, 80)));
  });
}

/** Stores the AI analysis on the application (one audit entry; counts only, no AI text). */
export function recordAiAnalysis(appId: string, actor: string, snapshot: AiAnalysisSnapshot): void {
  mutate((d) => {
    const a = findApp(d, appId);
    a.aiAnalysis = snapshot;
    const r = snapshot.result;
    a.audit.push(
      audit(
        actor,
        r.mock ? 'AI analysis run (mock, no model called)' : 'AI analysis run',
        `${r.model ?? 'mock provider'}; ${r.facts.length} fact(s), ${r.findingNotes.length} finding note(s), ` +
          `${r.dropped} item(s) removed by checks`,
      ),
    );
  });
}
