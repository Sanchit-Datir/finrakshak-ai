import type { Finding, IngestRun } from '@fund-tracker/shared';
import type { ToolCall, ToolModel, ToolResult } from '../ai/toolModel.js';
import { errorMessage, log } from '../log.js';
import type { Assessment } from './findings.js';
import type { HistorySource } from './history.js';
import { RUN_REVIEW_SYSTEM } from './prompts/runReview.js';
import type { ProposalDraft } from './proposals.js';
import { AGENT_TOOLS, type AgentTool, type ToolContext } from './tools.js';
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
  readonly note: string | null;
}

/** Read through a function so the compiler does not narrow away updates made inside `handle`. */
const hasSummary = (state: { summary: string | null }): boolean => state.summary !== null;

const TOOLS = new Map<string, AgentTool>(AGENT_TOOLS.map((t) => [t.spec.name, t]));

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

interface LoopState {
  calls: number;
  chars: number;
  summary: string | null;
  drafts: ProposalDraft[];
  note: string | null;
}

async function handle(
  call: ToolCall,
  ctx: ToolContext,
  state: LoopState,
  limits: SupervisorLimits,
): Promise<ToolResult> {
  const tool = TOOLS.get(call.name);
  const reply = (response: Record<string, unknown>): ToolResult => ({
    id: call.id,
    name: call.name,
    response,
  });
  if (!tool) return reply({ error: `unknown tool ${call.name}` });
  if (state.chars > limits.maxInputChars)
    return reply({ error: 'input budget used up: call submit_review now' });
  try {
    const out = await tool.run(call.args, ctx);
    if (out.kind === 'proposal') {
      if (violatesWording(out.draft.reason))
        return reply({ error: 'reason uses verdict words; describe the record neutrally' });
      if (state.drafts.length >= limits.maxProposals)
        return reply({ error: 'proposal limit reached' });
      state.drafts.push(out.draft);
    }
    if (out.kind === 'review') {
      if (violatesWording(out.summary))
        return reply({ error: 'summary uses verdict words; rewrite neutrally' });
      state.summary = out.summary;
    }
    state.chars += JSON.stringify(out.response).length;
    return reply(out.response);
  } catch (e) {
    // Invalid arguments are reported back to the model; nothing was executed.
    return reply({ error: errorMessage(e).slice(0, 300) });
  }
}

/**
 * The agent's tool loop: the model reads the code-computed digest, may look up details with
 * read-only tools, may propose allowlisted actions, and must finish with submit_review. Bounded
 * by a tool-call budget and an input budget; any model failure falls back to the templated review.
 */
export async function supervise(
  model: ToolModel,
  ctx: { run: IngestRun; assessment: Assessment; history: HistorySource },
  limits: SupervisorLimits,
): Promise<SupervisorResult> {
  const user = renderDigest(ctx.run, ctx.assessment);
  const state: LoopState = {
    calls: 0,
    chars: user.length + RUN_REVIEW_SYSTEM.length,
    summary: null,
    drafts: [],
    note: null,
  };
  const session = model.start(
    RUN_REVIEW_SYSTEM,
    user,
    AGENT_TOOLS.map((t) => t.spec),
  );
  let results: ToolResult[] = [];
  try {
    while (!hasSummary(state) && state.calls < limits.maxToolCalls) {
      const calls = await session.step(results);
      if (calls.length === 0) break;
      results = [];
      for (const call of calls.slice(0, limits.maxToolCalls - state.calls)) {
        state.calls++;
        results.push(await handle(call, ctx, state, limits));
        if (call.name === 'submit_review' && hasSummary(state)) break;
      }
    }
    if (state.summary === null)
      state.note = 'model did not submit a valid review within its budget';
  } catch (e) {
    state.note = `model unavailable: ${errorMessage(e).slice(0, 200)}`;
    log.warn('agent model failed; using the templated review', { error: errorMessage(e) });
  }
  const usage = session.usage();
  log.info('agent loop done', {
    calls: state.calls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    submitted: state.summary !== null,
  });
  return { summary: state.summary, drafts: state.drafts, toolCalls: state.calls, note: state.note };
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
