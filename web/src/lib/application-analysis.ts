import {
  APPLICATION_ANALYSIS_LIMITS as L,
  type AnalyseApplicationInput,
  type AnalysisDocument,
} from '@finrakshak-ai/shared';
import type { Application, FtDocument } from '../domain/schemas.js';
import type { AttentionScore } from './attention-score.js';
import type { Finding } from './checks.js';
import { docTypeLabel } from './doc-catalog.js';
import { maskIdentifier } from './format.js';

/**
 * What the browser sends to `analyseApplication`: recorded document fields and check findings only.
 * Identifier-like fields are masked first, and unreadable or empty fields are left out, so no more
 * personal data than the analysis needs leaves the workspace (B-16).
 */

const IDENTIFIER = /aadhaar|\bpan\b|pan_|account|mobile|phone|passport|voter|email|birth|\bdob\b/i;
/** Leaves room for the instructions inside the server's 24,000-character prompt cap (B-10). */
const DATA_BUDGET_CHARS = 20_000;

const clip = (s: string, max: number): string => s.trim().slice(0, max);

function documentOf(doc: FtDocument): AnalysisDocument {
  const fields = doc.fields
    .filter((f) => f.quality !== 'unreadable' && f.value.trim() !== '')
    .slice(0, L.maxFieldsPerDocument)
    .map((f) => ({
      fieldId: f.id,
      label: clip(f.label, 120) || f.key,
      value: clip(
        IDENTIFIER.test(`${f.key} ${f.label}`) ? maskIdentifier(f.value) : f.value,
        L.maxValueChars,
      ),
      reviewed: f.state === 'confirmed' || f.state === 'corrected',
    }));
  return { docId: doc.id, docType: clip(docTypeLabel(doc.docType), 80) || 'Document', fields };
}

export interface AnalysisRequest {
  readonly input: AnalyseApplicationInput;
  /** Documents left out because the data would not fit in one request. */
  readonly omittedDocuments: number;
}

export function buildAnalysisRequest(
  app: Application,
  docs: readonly FtDocument[],
  findings: readonly Finding[],
  attention: AttentionScore | null = null,
): AnalysisRequest {
  const base: AnalyseApplicationInput = {
    borrowerType: app.borrowerType,
    attention:
      attention === null
        ? null
        : {
            score: attention.score,
            band: attention.band,
            driverIds: attention.drivers.map((d) => d.findingId),
          },
    documents: [],
    findings: findings.slice(0, L.maxFindings).map((f) => ({
      findingId: f.id,
      title: clip(f.title, L.maxTextChars) || f.ruleId,
      priority: f.priority,
      observed: clip(f.observed, L.maxTextChars),
    })),
  };
  const candidates = docs.filter((d) => d.processing !== 'failed').map(documentOf);
  const documents: AnalysisDocument[] = [];
  let size = JSON.stringify(base).length;
  for (const d of candidates.slice(0, L.maxDocuments)) {
    const extra = JSON.stringify(d).length + 1;
    if (size + extra > DATA_BUDGET_CHARS) break;
    documents.push(d);
    size += extra;
  }
  return { input: { ...base, documents }, omittedDocuments: candidates.length - documents.length };
}

/** A short, stable key of any JSON value (FNV-1a over its JSON text and its length). */
export function inputsKeyOf(value: unknown): string {
  let h = 0x811c9dc5;
  const s = JSON.stringify(value);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${String(s.length)}:${h.toString(16)}`;
}

/** Same data, same key: a stored analysis is shown only while it still describes the application. */
export function analysisInputsKey(input: AnalyseApplicationInput): string {
  return inputsKeyOf(input);
}
