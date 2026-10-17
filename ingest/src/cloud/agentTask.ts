import { createHash } from 'node:crypto';
import type { AgentProposal, IngestRun, RunReview, SourceId } from '@fund-tracker/shared';
import { envelope, NO_USAGE } from '../ai/agentRuns.js';
import { readAiConfig, type AiConfig } from '../ai/config.js';
import { modelFor } from '../ai/models.js';
import type { Usage } from '../ai/toolModel.js';
import { assess, baseline, statusOf, type Assessment, type Baseline } from '../agent/findings.js';
import type { HistorySource } from '../agent/history.js';
import { RUN_REVIEW_PROMPT_VERSION } from '../agent/prompts/runReview.js';
import { persistDrafts, type ProposalDraft } from '../agent/proposals.js';
import { supervise, templatedSummary } from '../agent/supervisor.js';
import { emptyRun } from '../coordination/runLog.js';
import { log } from '../log.js';
import type { CloudDeps } from './context.js';
import type { CloudEnv } from './env.js';

const BASELINE_DAYS = 30;
const MAX_MODEL_PROPOSALS = 5;

async function baselines(run: IngestRun, history: HistorySource): Promise<Map<SourceId, Baseline>> {
  const out = new Map<SourceId, Baseline>();
  for (const s of Object.values(run.sources)) {
    const rows = (await history.recent(s.source_id, BASELINE_DAYS)).filter(
      (r) => r.run_id !== run.run_id,
    );
    out.set(s.source_id, baseline(rows));
  }
  return out;
}

const sameDraft = (a: ProposalDraft, b: ProposalDraft): boolean =>
  a.source_id === b.source_id && a.action === b.action;

/**
 * Code drafts win (they carry the automatic flag); when the model proposed the same action, its
 * explanation (e.g. a layout diagnosis) is appended to the code's reason instead of being lost.
 */
function mergeDrafts(
  code: readonly ProposalDraft[],
  model: readonly ProposalDraft[],
): ProposalDraft[] {
  const merged = code.map((c) => {
    const m = model.find((x) => sameDraft(x, c));
    return m ? { ...c, reason: `${c.reason} Agent: ${m.reason}`.slice(0, 500) } : c;
  });
  return [...merged, ...model.filter((m) => !code.some((c) => sameDraft(c, m)))];
}

interface Narrative {
  readonly summary: string;
  readonly model: string | null;
  readonly toolCalls: number;
  readonly usage: Usage;
  readonly modelDrafts: ProposalDraft[];
  /** True when a billed model's summary passed the checks and was used. */
  readonly modelWritten: boolean;
  readonly note: string | null;
}

async function narrate(
  run: IngestRun,
  assessment: Assessment,
  deps: CloudDeps,
  cfg: AiConfig,
): Promise<Narrative> {
  const fallback = templatedSummary(run, assessment.findings);
  // Healthy days and the kill switch never call the model (cost guard).
  if (statusOf(assessment.findings) === 'healthy' || !cfg.enabled)
    return {
      summary: fallback,
      model: null,
      toolCalls: 0,
      usage: NO_USAGE,
      modelDrafts: [],
      modelWritten: false,
      note: cfg.enabled ? 'healthy run: templated review' : 'agent switched off',
    };
  // The mock "submits" the code's own summary, so the full loop runs without a billed call.
  const model = modelFor(cfg, () => [
    { id: 'mock-1', name: 'submit_review', args: { summary: fallback } },
  ]);
  const result = await supervise(
    model,
    { run, assessment, history: deps.history },
    {
      maxToolCalls: cfg.maxToolCalls,
      maxInputChars: cfg.maxInputChars,
      maxProposals: MAX_MODEL_PROPOSALS,
    },
  );
  const summary =
    result.summary ?? `${fallback}${result.note ? ` (Agent note: ${result.note}.)` : ''}`;
  return {
    summary: summary.slice(0, 800),
    model: model.id,
    toolCalls: result.toolCalls,
    usage: result.usage,
    modelDrafts: result.drafts,
    modelWritten: model.id !== null && result.summary !== null,
    note: result.note,
  };
}

/**
 * Cloud Run task after the build: assesses the run with deterministic rules, asks the model for a
 * summary only when something needs attention, records the review and proposals, and asks
 * Workflows to re-run sources that failed transiently (once, on the first pass only).
 */
export async function runAgentTask(env: CloudEnv, deps: CloudDeps): Promise<boolean> {
  const cfg = readAiConfig();
  const now = new Date();
  const startedAt = now;
  const run = (await deps.runs.get(env.runId)) ?? emptyRun(env.runId);
  const assessment = assess(run, await baselines(run, deps.history), env.runAt);
  const status = statusOf(assessment.findings);
  const story = await narrate(run, assessment, deps, cfg);
  const codeDrafts =
    env.agentPass === 1 ? assessment.drafts : assessment.drafts.filter((d) => !d.auto);
  const drafts = mergeDrafts(codeDrafts, story.modelDrafts);
  const created: AgentProposal[] = await persistDrafts(deps.agent, env.runId, drafts, now);
  const rerunSources = created.flatMap((p) =>
    p.status === 'auto_approved' && p.action === 'rerun_source' && p.source_id ? [p.source_id] : [],
  );
  const review: RunReview = {
    run_id: env.runId,
    status,
    summary: story.summary,
    findings: assessment.findings,
    proposals_created: created.length,
    model: story.model,
    prompt_version: RUN_REVIEW_PROMPT_VERSION,
    input_hash: createHash('sha256')
      .update(JSON.stringify({ run, findings: assessment.findings }))
      .digest('hex'),
    tool_calls: story.toolCalls,
    generated_at: now.toISOString(),
  };
  await deps.agent.saveReview(review);
  await deps.runs.recordReview(env.runId, { status, rerunSources });
  await deps.agentRuns.save(
    envelope({
      agent: 'ingestion',
      runId: env.runId,
      trigger: 'daily',
      startedAt,
      finishedAt: new Date(),
      status: story.modelWritten ? 'done' : 'templated',
      model: story.model,
      promptVersion: RUN_REVIEW_PROMPT_VERSION,
      inputHash: review.input_hash,
      toolCalls: story.toolCalls,
      usage: story.usage,
      outputs: 1 + created.length,
      outputRef: `ingestReviews/${env.runId}`,
      note: story.note,
    }),
  );
  log.info('agent review recorded', {
    run: env.runId,
    status,
    proposals: created.length,
    reruns: rerunSources.join(','),
    model: story.model,
  });
  return true;
}
