import { linkedEntities, loanOutflows, ownerOf } from './common.js';
import type { RuleEntity, RuleLoan, RuleRelationship, RuleTransaction } from './types.js';

export interface LinkedCounterpartyDetection<R extends RuleRelationship = RuleRelationship> {
  readonly rule: 'linked_counterparty';
  readonly loanId: string;
  /** The entity (not the account) that received the money. */
  readonly ownerId: string;
  /** The relationships from the borrower to the owner: one or two hops. */
  readonly path: R[];
  readonly transactions: RuleTransaction[];
  readonly totalMinor: number;
  readonly detectedAt: string;
}

/** Owners linked to the borrower within two hops (borrower → owner → owner's companies). */
function linkedCircle<R extends RuleRelationship>(
  borrowerEntity: string,
  rels: readonly R[],
): Map<string, R[]> {
  const out = new Map<string, R[]>();
  for (const a of linkedEntities(borrowerEntity, rels)) {
    out.set(a.entityId, [a.rel]);
    for (const b of linkedEntities(a.entityId, rels)) {
      if (b.entityId !== borrowerEntity && !out.has(b.entityId))
        out.set(b.entityId, [a.rel, b.rel]);
    }
  }
  return out;
}

/** Any outflow to an entity within two relationship hops of the borrower. One per linked entity. */
export function detectLinkedCounterparty<R extends RuleRelationship>(
  loan: RuleLoan,
  txns: readonly RuleTransaction[],
  entities: ReadonlyMap<string, RuleEntity>,
  rels: readonly R[],
): LinkedCounterpartyDetection<R>[] {
  const borrowerEntity = ownerOf(loan.accountEntityId, entities);
  const circle = linkedCircle(borrowerEntity, rels);
  const byOwner = new Map<string, RuleTransaction[]>();
  for (const t of loanOutflows(loan, txns)) {
    const owner = ownerOf(t.toId, entities);
    if (owner === borrowerEntity || !circle.has(owner)) continue;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), t]);
  }
  return [...byOwner.entries()].map(([owner, list]) => ({
    rule: 'linked_counterparty' as const,
    loanId: loan.id,
    ownerId: owner,
    path: circle.get(owner) ?? [],
    transactions: list,
    totalMinor: list.reduce((s, t) => s + t.amountMinor, 0),
    detectedAt: list[0]?.at ?? loan.disbursedAt,
  }));
}
