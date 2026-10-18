import { RISK_BAND_LABELS, type RiskAlertDoc } from '@finrakshak-ai/shared';
import { z } from 'zod';
import { runToolLoop, type LoopTool } from '../ai/toolLoop.js';
import type { ToolCall, ToolModel, Usage } from '../ai/toolModel.js';
import { explanationProblem } from './checks.js';
import { explainDigest, explainInputHash, rankedReasons, REASON_TOPICS } from './digest.js';
import { BORROWER, placeholdersFor, restore } from './placeholders.js';
import { EXPLAIN_SYSTEM } from './prompts/explain.js';

/**
 * One alert, one short model call (RISK_EXPLAINER_PLAN.md, design 3): the only tool is
 * `submit_explanation`. The model gets one more try after a rejected text (two calls at most); then the
 * alert keeps only its templated text.
 */

export const EXPLAIN_MAX_CALLS = 2;

interface Ctx {
  readonly alertId: string;
}

interface Out {
  readonly text: string;
  readonly response: Record<string, unknown>;
}

const SubmitArgs = z
  .object({ alert_id: z.string().min(1).max(200), text: z.string().trim().min(1).max(600) })
  .strict();

const submitExplanation: LoopTool<Ctx, Out> = {
  spec: {
    name: 'submit_explanation',
    description: 'Submit the summary of this alert (at most two sentences, 400 characters).',
    parameters: {
      type: 'object',
      properties: {
        alert_id: { type: 'string' },
        text: { type: 'string', minLength: 1, maxLength: 600 },
      },
      required: ['alert_id', 'text'],
    },
  },
  run: (args, ctx) =>
    Promise.resolve().then(() => {
      const { alert_id, text } = SubmitArgs.parse(args);
      if (alert_id !== ctx.alertId) throw new Error('alert_id does not match this alert');
      return { text, response: { accepted: true } };
    }),
};

export interface Explanation {
  /** The checked sentence with the words restored, or null when the template stays alone. */
  readonly text: string | null;
  readonly inputHash: string;
  readonly toolCalls: number;
  readonly usage: Usage;
  readonly note: string | null;
}

/** The code's own sentence: what the mock submits, so the loop and the checks run without a billed call. */
export function templatedExplanation(alert: RiskAlertDoc): string {
  const top = rankedReasons(alert)[0];
  if (top === undefined) return `${BORROWER}'s score is ${alert.score}.`;
  const change = alert.delta === null ? '' : `, a change of ${alert.delta} points`;
  const status = top.evidence_statuses.join(', ') || 'not stated';
  return `${BORROWER}'s score is ${alert.score} (${RISK_BAND_LABELS[alert.band]})${change}, mainly because of ${REASON_TOPICS[top.code].words} (${top.points} points; evidence status: ${status}).`;
}

export const scriptedExplanation = (alert: RiskAlertDoc): ToolCall[] => [
  {
    id: 'mock-1',
    name: 'submit_explanation',
    args: { alert_id: alert.alert_id, text: templatedExplanation(alert) },
  },
];

export async function explainAlert(
  model: ToolModel,
  alert: RiskAlertDoc,
  maxInputChars: number,
): Promise<Explanation> {
  const ph = placeholdersFor(alert);
  const ranked = rankedReasons(alert);
  const digest = { alert_id: alert.alert_id, ...explainDigest(alert, ph) };
  const kept: { text: string | null } = { text: null };
  const loop = await runToolLoop(model, {
    system: EXPLAIN_SYSTEM,
    user: JSON.stringify(digest),
    tools: [submitExplanation],
    ctx: { alertId: alert.alert_id },
    limits: { maxToolCalls: EXPLAIN_MAX_CALLS, maxInputChars },
    finish: ['submit_explanation'],
    finishHint: 'submit_explanation',
    accept: (out) => {
      const problem = explanationProblem(out.text, digest, ph, ranked);
      if (problem === null) kept.text = out.text;
      return problem;
    },
    done: () => kept.text !== null,
  });
  const text = kept.text;
  const note =
    loop.failure !== null
      ? `model unavailable: ${loop.failure}`
      : text === null
        ? 'no explanation passed the checks'
        : null;
  return {
    text: text === null ? null : restore(text, ph),
    inputHash: explainInputHash(digest),
    toolCalls: loop.toolCalls,
    usage: loop.usage,
    note,
  };
}
