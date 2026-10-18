import { bandRank, type RiskAlertDoc, type RiskExplanationDoc } from '@finrakshak-ai/shared';
import { envelope, NO_USAGE } from '../ai/agentRuns.js';
import { readAiConfig, type AiConfig } from '../ai/config.js';
import { modelFor } from '../ai/models.js';
import type { Usage } from '../ai/toolModel.js';
import { firestore } from '../coordination/firestore.js';
import { explainAlert, scriptedExplanation } from '../explain/explainer.js';
import { EXPLAIN_PROMPT_VERSION } from '../explain/prompts/explain.js';
import { FirestoreExplainStore, MemoryExplainStore, type ExplainStore } from '../explain/store.js';
import { log } from '../log.js';
import { sha256Hex } from '../miner/hash.js';
import type { CloudDeps } from './context.js';
import type { CloudEnv } from './env.js';

/**
 * Cloud Run task `explain` (job `ingest-explain`, RISK_EXPLAINER_PLAN.md E2): after `score`, off by
 * default (`FINRAKSHAK_AI_EXPLAIN_ENABLED`). For each new alert of this run (most urgent first, capped), one
 * short model call words the recorded reasons; code checks the sentence and stores it beside the alert
 * (`synthRiskExplanations`). The mock and the kill switch store nothing. SYNTH data only (B-54).
 */

/** Alerts read per run before the cap picks the most urgent (one run raises about 3% of loans). */
const READ_LIMIT = 200;

export interface ExplainPorts {
  readonly store: ExplainStore;
}

export const defaultExplainPorts = (env: CloudEnv): ExplainPorts => ({
  store:
    env.coordination === 'firestore'
      ? new FirestoreExplainStore(firestore())
      : new MemoryExplainStore(),
});

interface Tally {
  status: 'done' | 'templated' | 'skipped';
  model: string | null;
  hashes: string[];
  toolCalls: number;
  usage: Usage;
  written: number;
  rejected: number;
  note: string;
}

const mostUrgent = (a: RiskAlertDoc, b: RiskAlertDoc): number =>
  bandRank(b.band) - bandRank(a.band) || b.score - a.score || (a.alert_id < b.alert_id ? -1 : 1);

const docOf = (
  a: RiskAlertDoc,
  text: string,
  model: string,
  inputHash: string,
): RiskExplanationDoc => ({
  alert_id: a.alert_id,
  loan_id: a.loan_id,
  branch_id: a.branch_id,
  run_id: a.run_id,
  text,
  model,
  prompt_version: EXPLAIN_PROMPT_VERSION,
  input_hash: inputHash,
  created_at: new Date().toISOString(),
  synthetic: true,
});

async function explainEach(
  todo: readonly RiskAlertDoc[],
  store: ExplainStore,
  cfg: AiConfig,
  t: Tally,
): Promise<void> {
  for (const alert of todo) {
    const model = modelFor(cfg, () => scriptedExplanation(alert));
    t.model = model.id;
    const out = await explainAlert(model, alert, cfg.maxInputChars);
    t.hashes.push(out.inputHash);
    t.toolCalls += out.toolCalls;
    t.usage = {
      inputTokens: t.usage.inputTokens + out.usage.inputTokens,
      outputTokens: t.usage.outputTokens + out.usage.outputTokens,
    };
    if (out.text === null) t.rejected++;
    // The mock's sentence is the code's own: it is checked like any other, never stored as AI text.
    else if (
      model.id !== null &&
      (await store.create(docOf(alert, out.text, model.id, out.inputHash)))
    )
      t.written++;
  }
}

async function explain(env: CloudEnv, ports: ExplainPorts, cfg: AiConfig): Promise<Tally> {
  const t: Tally = {
    status: 'skipped',
    model: null,
    hashes: [],
    toolCalls: 0,
    usage: NO_USAGE,
    written: 0,
    rejected: 0,
    note: '',
  };
  if (!cfg.explainer.enabled)
    return { ...t, note: 'explainer switched off (FINRAKSHAK_AI_EXPLAIN_ENABLED=false)' };
  const alerts = (await ports.store.alertsOfRun(env.runId, READ_LIMIT)).sort(mostUrgent);
  if (alerts.length === 0) return { ...t, note: 'no alerts in this run' };
  const picked = alerts.slice(0, cfg.explainer.maxAlerts);
  const done = await ports.store.explained(picked.map((a) => a.alert_id));
  const todo = picked.filter((a) => !done.has(a.alert_id));
  if (todo.length === 0) return { ...t, note: 'every alert already has an explanation' };
  await explainEach(todo, ports.store, cfg, t);
  const capped = alerts.length - picked.length;
  t.status = t.written > 0 ? 'done' : 'templated';
  t.note = `${t.written} written, ${t.rejected} kept the template, ${capped} over the cap${t.model === null ? '; mock provider stores nothing' : ''}`;
  return t;
}

export async function runExplainTask(
  env: CloudEnv,
  deps: CloudDeps,
  ports: ExplainPorts | null = null,
): Promise<boolean> {
  const startedAt = new Date();
  const t = await explain(env, ports ?? defaultExplainPorts(env), readAiConfig());
  await deps.agentRuns.save(
    envelope({
      agent: 'explainer',
      runId: env.runId,
      trigger: 'daily',
      startedAt,
      finishedAt: new Date(),
      status: t.status,
      model: t.model,
      promptVersion: EXPLAIN_PROMPT_VERSION,
      inputHash: sha256Hex(t.hashes.join('|')),
      toolCalls: t.toolCalls,
      usage: t.usage,
      outputs: t.written,
      outputRef: t.written > 0 ? 'synthRiskExplanations' : null,
      note: t.note,
    }),
  );
  log.info('explainer run recorded', { run: env.runId, status: t.status, written: t.written });
  return true;
}
