import type { PublishChannel } from '@finrakshak-ai/shared';
import { envelope, NO_USAGE } from '../ai/agentRuns.js';
import { readAiConfig, type AiConfig } from '../ai/config.js';
import { modelFor } from '../ai/models.js';
import type { Usage } from '../ai/toolModel.js';
import { firestore } from '../coordination/firestore.js';
import { log } from '../log.js';
import { minerInputHash, reviewCandidates, scriptedReview } from '../miner/agent.js';
import { sha256Hex } from '../miner/hash.js';
import { loadMinerContext } from '../miner/load.js';
import { MINE_PROMPT_VERSION } from '../miner/prompts/mine.js';
import { MAX_PATTERN_PROPOSALS, patternProposalId, planProposals } from '../miner/proposals.js';
import { DEFAULT_MINER_SETTINGS, type MinerSettings } from '../miner/settings.js';
import {
  BlobPatternProposalStore,
  FirestorePatternProposalStore,
  type PatternProposalStore,
} from '../miner/store.js';
import type { MinerContext } from '../miner/tools.js';
import type { CloudDeps } from './context.js';
import type { CloudEnv } from './env.js';
import { readCurrent } from './publish.js';

/**
 * Cloud Run task `mine` (job `ingest-miner`, PATTERN_MINER_PLAN.md MVP 3): on demand only, off by default
 * (`FINRAKSHAK_AI_MINER_ENABLED`). Code finds the candidates; the model only words or rejects them; the job
 * writes proposals to `patternProposals` and nothing else (B-61). The mock provider and the kill switch
 * store no proposals. Every execution records one `agentRuns` envelope.
 */

export interface MinePorts {
  readonly store: PatternProposalStore;
  readonly load: (settings: MinerSettings) => Promise<MinerContext>;
  /** True when a gated build has been published on this run's channel (B-50). */
  readonly published: () => Promise<boolean>;
}

export function defaultMinePorts(env: CloudEnv): MinePorts {
  const channel: PublishChannel = env.publishEnabled ? 'live' : 'dry-run';
  return {
    store:
      env.coordination === 'firestore'
        ? new FirestorePatternProposalStore(firestore())
        : new BlobPatternProposalStore(),
    load: loadMinerContext,
    published: async () => (await readCurrent(channel)).value !== null,
  };
}

interface Outcome {
  readonly status: 'done' | 'templated' | 'skipped';
  readonly inputHash: string;
  readonly model: string | null;
  readonly toolCalls: number;
  readonly usage: Usage;
  readonly outputs: number;
  readonly note: string;
}

const skipped = (note: string, inputHash = sha256Hex('')): Outcome => ({
  status: 'skipped',
  inputHash,
  model: null,
  toolCalls: 0,
  usage: NO_USAGE,
  outputs: 0,
  note,
});

/** Candidates not live, not waiting, and not already proposed (or decided) on this same input. */
async function freshContext(
  ctx: MinerContext,
  ports: MinePorts,
  inputHash: string,
  known: Known,
): Promise<MinerContext> {
  const ids = ctx.result.candidates.map((c) => patternProposalId(c.pattern_id, inputHash));
  const done = await ports.store.existing(ids);
  const candidates = ctx.result.candidates.filter(
    (c, i) =>
      !known.live.has(c.pattern_id) && !known.open.has(c.pattern_id) && !done.has(ids[i] ?? ''),
  );
  return { ...ctx, result: { ...ctx.result, candidates } };
}

interface Known {
  readonly live: ReadonlySet<string>;
  readonly open: ReadonlySet<string>;
}

/** The model words or rejects the fresh candidates; code builds and stores the proposals. */
async function propose(
  env: CloudEnv,
  cfg: AiConfig,
  store: PatternProposalStore,
  run: { ctx: MinerContext; known: Known; inputHash: string; now: Date },
): Promise<Outcome> {
  const { ctx, known, inputHash, now } = run;
  const model = modelFor(cfg, () => scriptedReview(ctx.result));
  const agent = await reviewCandidates(
    model,
    ctx,
    {
      maxToolCalls: cfg.miner.maxToolCalls,
      maxInputChars: cfg.maxInputChars,
      maxProposals: MAX_PATTERN_PROPOSALS,
    },
    known.live,
  );
  const plan = planProposals(ctx.result, agent, known, {
    runId: env.runId,
    model: model.id,
    promptVersion: MINE_PROMPT_VERSION,
    inputHash,
    now,
    maxProposals: MAX_PATTERN_PROPOSALS,
  });
  const base = { inputHash, model: model.id, toolCalls: agent.toolCalls, usage: agent.usage };
  const tally = `${plan.skipped.rejected} rejected by the model, ${plan.skipped.over_cap} over the cap`;
  // The mock's words are the code's own: worked out in full, never stored as proposals.
  if (model.id === null)
    return {
      ...base,
      status: 'templated',
      outputs: 0,
      note: `mock provider: ${plan.proposals.length} proposals worked out, none stored; ${tally}`,
    };
  let created = 0;
  for (const p of plan.proposals) if (await store.create(p)) created++;
  return {
    ...base,
    status: agent.worded.size > 0 ? 'done' : 'templated',
    outputs: created,
    note: `${created} proposed; ${tally}${agent.note === null ? '' : `; ${agent.note}`}`,
  };
}

async function mine(env: CloudEnv, ports: MinePorts, cfg: AiConfig): Promise<Outcome> {
  if (!cfg.miner.enabled) return skipped('miner switched off (FINRAKSHAK_AI_MINER_ENABLED=false)');
  if (!(await ports.published())) return skipped('no published build yet (B-50)');
  const now = new Date();
  const all = await ports.load(DEFAULT_MINER_SETTINGS);
  const inputHash = minerInputHash(all.result);
  if (all.result.candidates.length === 0) return skipped('the code found no candidates', inputHash);
  const [open, live] = await Promise.all([
    ports.store.openPatternIds(now),
    ports.store.livePatternIds(),
  ]);
  const ctx = await freshContext(all, ports, inputHash, { live, open });
  if (ctx.result.candidates.length === 0)
    return skipped('nothing new since the last run (same input)', inputHash);
  return propose(env, cfg, ports.store, { ctx, known: { live, open }, inputHash, now });
}

export async function runMineTask(
  env: CloudEnv,
  deps: CloudDeps,
  ports: MinePorts | null = null,
): Promise<boolean> {
  const startedAt = new Date();
  const cfg = readAiConfig();
  const out = await mine(env, ports ?? defaultMinePorts(env), cfg);
  await deps.agentRuns.save(
    envelope({
      agent: 'miner',
      runId: env.runId,
      trigger: 'manual',
      startedAt,
      finishedAt: new Date(),
      status: out.status,
      model: out.model,
      promptVersion: MINE_PROMPT_VERSION,
      inputHash: out.inputHash,
      toolCalls: out.toolCalls,
      usage: out.usage,
      outputs: out.outputs,
      outputRef: out.outputs > 0 ? 'patternProposals' : null,
      note: out.note,
    }),
  );
  log.info('miner run recorded', { run: env.runId, status: out.status, outputs: out.outputs });
  return true;
}
