import type { Finding, IngestRun } from '@fund-tracker/shared';
import { runToolLoop } from '../ai/toolLoop.js';
import type { ToolModel, Usage } from '../ai/toolModel.js';
import { log } from '../log.js';
import type { Assessment } from './findings.js';
import { RUN_REVIEW_SYSTEM } from './prompts/runReview.js';
import type { ProposalDraft } from './proposals.js';
import { AGENT_TOOLS, type ToolContext, type ToolOutcome } from './tools.js';
import { violatesWording } from './wording.js';

export interface SupervisorLimits {
  readonly maxToolCalls: number;
  readonly maxInputChars: number;
  /** At most this many model proposals per run. */
  readonly maxProposals: number;
}

export interface SupervisorResult {
  /** The model's summary, or null when it failed, broke a rule or ran out of budget. */
  readonly summary: string | null;
  readonly drafts: ProposalDraft[];
  readonly toolCalls: number;
  readonly usage: Usage;
  readonly note: string | null;
}

function renderDigest(run: IngestRun, assessment: Assessment): string {
  return JSON.stringify({
    run_id: run.run_id,
    findings: assessment.findings,
    suggested_by_rules: assessment.drafts.map((d) => ({
      source: d.source_id,
      action: d.action,
      reason: d.reason,
    })),
    sources: Object.values(run.sources).map((s) => ({
      source: s.source_id,
      status: s.status,
      added: s.added,
      changed: s.changed,
      removed: s.removed,
    })),
    build: run.build?.status ?? null,
  });
}

interface Kept {
  summary: string | null;
  drafts: ProposalDraft[];
}

/** The ingestion agent's own output rules: neutral wording and the proposal cap (B-49). */
function acceptOutcome(out: ToolOutcome, kept: Kept, limits: SupervisorLimits): string | null {
  if (out.kind === 'proposal') {
    if (violatesWording(out.draft.reason))
      return 'reason uses verdict words; describe the record neutrally';
    if (kept.drafts.length >= limits.maxProposals) return 'proposal limit reached';
    kept.drafts.push(out.draft);
  }
  if (out.kind === 'review') {
    if (violatesWording(out.summary)) return 'summary uses verdict words; rewrite neutrally';
    kept.summary = out.summary;
  }
  return null;
}

/**
 * The agent's tool loop: the model reads the code-computed digest, may look up details with
 * read-only tools, may propose allowlisted actions, and must finish with submit_review. Bounded
 * by a tool-call budget and an input budget (shared `runToolLoop`); any model failure falls back
 * to the templated review.
 */
export async function supervise(
  model: ToolModel,
  ctx: ToolContext,
  limits: SupervisorLimits,
): Promise<SupervisorResult> {
  const kept: Kept = { summary: null, drafts: [] };
  const loop = await runToolLoop(model, {
    system: RUN_REVIEW_SYSTEM,
    user: renderDigest(ctx.run, ctx.assessment),
    tools: AGENT_TOOLS,
    ctx,
    limits,
    finish: ['submit_review'],
    finishHint: 'submit_review',
    accept: (out) => acceptOutcome(out, kept, limits),
    done: () => kept.summary !== null,
  });
  let note: string | null = null;
  if (loop.failure !== null) {
    note = `model unavailable: ${loop.failure}`;
    log.warn('agent model failed; using the templated review', { error: loop.failure });
  } else if (kept.summary === null) note = 'model did not submit a valid review within its budget';
  log.info('agent loop done', {
    calls: loop.toolCalls,
    inputTokens: loop.usage.inputTokens,
    outputTokens: loop.usage.outputTokens,
    submitted: kept.summary !== null,
  });
  return {
    summary: kept.summary,
    drafts: kept.drafts,
    toolCalls: loop.toolCalls,
    usage: loop.usage,
    note,
  };
}

/** Code-written summary: used on healthy days, with the kill switch, and as the fallback. */
export function templatedSummary(run: IngestRun, findings: readonly Finding[]): string {
  const sources = Object.values(run.sources);
  const changed = sources.filter((s) => s.added + s.changed + s.removed > 0);
  const failed = sources.filter((s) => s.status === 'failed').map((s) => s.source_id);
  const parts = [
    `${sources.length} sources checked; ${changed.length ? changed.map((s) => `${s.source_id} +${s.added} ~${s.changed} -${s.removed}`).join(', ') : 'no changes'}.`,
    failed.length ? `Failed: ${failed.join(', ')}.` : 'No source failed.',
    `Build: ${run.build?.status ?? 'not recorded'}${run.build?.version ? ` (version ${run.build.version})` : ''}.`,
  ];
  const serious = findings.filter((f) => f.severity !== 'info');
  if (serious.length)
    parts.push(
      `${serious.length} finding(s) need attention: ${serious.map((f) => f.code).join(', ')}.`,
    );
  return parts.join(' ').slice(0, 800);
}
