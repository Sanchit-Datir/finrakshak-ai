import type { AgentAction, AgentProposal, SourceId } from '@fund-tracker/shared';
import { createHash } from 'node:crypto';
import type { SourceFlags } from '../cloud/env.js';
import type { AgentStore } from './store.js';

/** How long the owner has to decide before a proposal expires. */
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProposalDraft {
  readonly source_id: SourceId | null;
  readonly action: AgentAction;
  readonly reason: string;
  /** Set only by code for `rerun_source` on a transient error (never by the model, B-49). */
  readonly auto: boolean;
}

/** Deterministic id: the same draft in the same run is one proposal, even if a step retries. */
export function proposalId(
  runId: string,
  draft: Pick<ProposalDraft, 'source_id' | 'action'>,
): string {
  const hash = createHash('sha256')
    .update(`${runId}|${draft.source_id ?? '-'}|${draft.action}`)
    .digest('hex');
  return `p_${hash.slice(0, 24)}`;
}

export function toProposal(runId: string, draft: ProposalDraft, now: Date): AgentProposal {
  return {
    id: proposalId(runId, draft),
    run_id: runId,
    source_id: draft.source_id,
    action: draft.action,
    reason: draft.reason.slice(0, 500),
    status: draft.auto ? 'auto_approved' : 'proposed',
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
    decided_at: draft.auto ? now.toISOString() : null,
    decided_by: draft.auto ? 'agent' : null,
    applied_run_id: null,
  };
}

const sameTarget = (
  a: Pick<AgentProposal, 'source_id' | 'action'>,
  b: Pick<AgentProposal, 'source_id' | 'action'>,
): boolean => a.source_id === b.source_id && a.action === b.action;

/**
 * Creates the drafts that are not already open (one open proposal per source and action), and
 * expires stale ones. Returns what was created.
 */
export async function persistDrafts(
  store: AgentStore,
  runId: string,
  drafts: readonly ProposalDraft[],
  now: Date,
): Promise<AgentProposal[]> {
  const open = await store.openProposals();
  for (const p of open)
    if (p.status === 'proposed' && Date.parse(p.expires_at) < now.getTime())
      await store.updateProposal({ ...p, status: 'expired' });
  const live = open.filter(
    (p) => !(p.status === 'proposed' && Date.parse(p.expires_at) < now.getTime()),
  );
  const created: AgentProposal[] = [];
  for (const draft of drafts) {
    if ([...live, ...created].some((p) => sameTarget(p, draft))) continue;
    const proposal = toProposal(runId, draft, now);
    await store.createProposal(proposal);
    created.push(proposal);
  }
  return created;
}

/** One-run flags from proposals the owner approved (plus pauses that stay in force until resolved). */
export function flagsFromProposals(
  open: readonly AgentProposal[],
): Partial<Record<SourceId, SourceFlags>> {
  const flags: Partial<Record<SourceId, SourceFlags>> = {};
  for (const p of open) {
    if (p.source_id === null || p.status !== 'approved') continue;
    const current = flags[p.source_id] ?? {};
    if (p.action === 'full_relist') flags[p.source_id] = { ...current, forceFull: true };
    if (p.action === 'accept_shrink') flags[p.source_id] = { ...current, allowShrink: true };
    if (p.action === 'pause_source') flags[p.source_id] = { ...current, skip: true };
  }
  return flags;
}

/** Actions that are consumed by one run; a pause stays approved until the owner resolves it. */
const ONE_SHOT: ReadonlySet<AgentAction> = new Set([
  'full_relist',
  'accept_shrink',
  'rerun_source',
  'rollback_publish',
]);

export async function markApplied(
  store: AgentStore,
  proposals: readonly AgentProposal[],
  runId: string,
): Promise<void> {
  for (const p of proposals)
    if (ONE_SHOT.has(p.action))
      await store.updateProposal({ ...p, status: 'applied', applied_run_id: runId });
}
