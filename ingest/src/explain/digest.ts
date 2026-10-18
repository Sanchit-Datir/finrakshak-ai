import {
  RISK_BAND_LABELS,
  canonicalJson,
  type Reason,
  type ReasonCode,
  type RiskAlertDoc,
} from '@finrakshak-ai/shared';
import { sha256Hex } from '../miner/hash.js';
import { mask, type Placeholders } from './placeholders.js';
import { EXPLAIN_PROMPT_VERSION } from './prompts/explain.js';

/**
 * The explainer's input (RISK_EXPLAINER_PLAN.md, design 1): structured and small, from the alert's stored
 * reasons only. No document titles and no free text from outside; ids become placeholders. Short codes
 * in `facts` are kept, anything longer or unusual is dropped.
 */

/** How the top reason must be named in the sentence, and the words the templated sentence uses. */
export const REASON_TOPICS: Readonly<Record<ReasonCode, { words: string; named: RegExp }>> = {
  public_record_after_disbursement: {
    words: 'a public record dated after disbursement',
    named: /public record/i,
  },
  public_record_before_disbursement: {
    words: 'a public record from before disbursement',
    named: /public record/i,
  },
  nfra_finding: { words: 'an NFRA record about the audit', named: /NFRA/ },
  several_proceedings: { words: 'several public records', named: /record/i },
  many_sources: { words: 'public records from several sources', named: /source/i },
  related_party_record: {
    words: 'a public record naming a director or owner',
    named: /director|owner|related/i,
  },
  graph_proximity: { words: 'a linked entity with a public record', named: /link/i },
  pattern_match: { words: 'a match with an approved pattern', named: /pattern/i },
  missed_emi: { words: 'missed EMIs', named: /EMI/ },
  late_emi: { words: 'late EMIs', named: /EMI/ },
  partial_emi: { words: 'part-paid EMIs', named: /EMI/ },
  growing_delay: { words: 'growing EMI delays', named: /EMI|delay/i },
  receipts_fall: { words: 'a fall in receipts', named: /receipt/i },
};

const SHORT_CODE = /^[A-Za-z0-9_ ,.:-]{1,60}$/;

function cleanFacts(r: Reason, ph: Placeholders): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r.facts)) {
    if (typeof v === 'number') out[k] = v;
    else {
      const masked = mask(v, ph);
      if (SHORT_CODE.test(masked) || /^\{[A-Z0-9_]+\}$/.test(masked)) out[k] = masked;
    }
  }
  return out;
}

/** The alert's reasons, largest first: the first is the top reason the sentence must name. */
export const rankedReasons = (alert: RiskAlertDoc): Reason[] =>
  [...alert.reasons].sort((a, b) => b.points - a.points || (a.reason_key < b.reason_key ? -1 : 1));

export function explainDigest(alert: RiskAlertDoc, ph: Placeholders): Record<string, unknown> {
  return {
    alert_kind: alert.kind,
    band: RISK_BAND_LABELS[alert.band],
    score: alert.score,
    score_change: alert.delta,
    previous_score: alert.delta === null ? null : alert.score - alert.delta,
    as_of: alert.as_of,
    reasons: rankedReasons(alert).map((r, i) => ({
      ref: `r${i + 1}`,
      code: r.code,
      layer: r.layer,
      points: r.points,
      about: ph.byId.get(r.subject_id) ?? null,
      source: mask(r.source, ph),
      evidence_statuses: r.evidence_statuses,
      facts: cleanFacts(r, ph),
      pattern: r.pattern === null ? null : { name: mask(r.pattern.pattern_name, ph).slice(0, 80) },
    })),
  };
}

/** sha256 of the digest and prompt version (no prompt text is stored). */
export const explainInputHash = (digest: Record<string, unknown>): string =>
  sha256Hex(canonicalJson({ prompt: EXPLAIN_PROMPT_VERSION, digest }));
