import type { AgentProposal, ProposalDecision } from '@fund-tracker/shared';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

/**
 * Narrow runtime schemas (functions deploy without workspace packages); the type checks keep
 * them in step with `AgentProposal` / `ProposalDecision` in packages/shared.
 */
const InputSchema = z.object({
  proposalId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  decision: z.enum(['approve', 'reject', 'resolve']),
});
const StoredSchema = z.object({
  status: z.enum([
    'proposed',
    'auto_approved',
    'approved',
    'rejected',
    'applied',
    'expired',
    'resolved',
  ]),
  action: z.string(),
  expires_at: z.string().datetime(),
});

type AssertTrue<T extends true> = T;
export type InputInSync = AssertTrue<
  z.infer<typeof InputSchema> extends ProposalDecision ? true : false
>;
export type StatusInSync = AssertTrue<
  AgentProposal['status'] extends z.infer<typeof StoredSchema>['status'] ? true : false
>;

type Status = z.infer<typeof StoredSchema>['status'];

/** Allowed transitions (B-49): the owner approves or rejects proposals, and resolves pauses/fixes. */
function nextStatus(
  current: Status,
  action: string,
  decision: z.infer<typeof InputSchema>['decision'],
): Status | null {
  if (decision === 'approve') return current === 'proposed' ? 'approved' : null;
  if (decision === 'reject')
    return current === 'proposed' || current === 'auto_approved' ? 'rejected' : null;
  const resolvable =
    current === 'proposed' ||
    current === 'approved' ||
    (current === 'applied' && action === 'pause_source');
  return resolvable ? 'resolved' : null;
}

export async function decideProposalHandler(
  request: CallableRequest<unknown>,
): Promise<{ status: Status }> {
  if (request.auth === undefined) throw new HttpsError('unauthenticated', 'Sign in required');
  // Only the pipeline owner (custom claim `admin`) may approve agent proposals.
  if (request.auth.token['admin'] !== true) throw new HttpsError('permission-denied', 'Owner only');
  const input = InputSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError('invalid-argument', 'A proposal id and a decision are required');
  const { proposalId, decision } = input.data;
  const uid = request.auth.uid;
  const ref = getFirestore().collection('agentProposals').doc(proposalId);
  const status = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Proposal not found');
    const stored = StoredSchema.safeParse(snap.data());
    if (!stored.success) throw new HttpsError('failed-precondition', 'Proposal is malformed');
    const { status: current, action, expires_at } = stored.data;
    // Past its deadline, a proposal may still be rejected or resolved, but not approved: the
    // agent proposes it again if it is still needed (the next run marks it expired, B-49).
    if (decision === 'approve' && Date.parse(expires_at) <= Date.now())
      throw new HttpsError('failed-precondition', 'This proposal has expired');
    const next = nextStatus(current, action, decision);
    if (next === null)
      throw new HttpsError(
        'failed-precondition',
        `Cannot ${decision} a proposal that is ${current.replace('_', ' ')}`,
      );
    tx.update(ref, { status: next, decided_at: new Date().toISOString(), decided_by: uid });
    return next;
  });
  logger.info('decideProposal', { proposalId, decision, status });
  return { status };
}

export const decideProposal = onCall(
  {
    region: 'asia-south1',
    enforceAppCheck: true,
    maxInstances: 2,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  decideProposalHandler,
);
