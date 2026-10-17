import type { RuleEntity, RuleLoan, RuleRelationship, RuleTransaction } from './types.js';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const time = (iso: string): number => new Date(iso).getTime();

export function sortByTime(txns: readonly RuleTransaction[]): RuleTransaction[] {
  return [...txns].sort((a, b) => time(a.at) - time(b.at));
}

/** Outflows from the loan's credited account after disbursement, in time order. */
export function loanOutflows(loan: RuleLoan, txns: readonly RuleTransaction[]): RuleTransaction[] {
  const start = time(loan.disbursedAt);
  return sortByTime(
    txns.filter(
      (t) =>
        t.fromId === loan.accountEntityId &&
        t.type !== 'repayment' &&
        time(t.at) >= start &&
        time(t.at) <= start + loan.monitoringDays * DAY,
    ),
  );
}

/** The entity that owns an account, or the id itself when it is not an owned account. */
export const ownerOf = (entityId: string, entities: ReadonlyMap<string, RuleEntity>): string =>
  entities.get(entityId)?.ownerId ?? entityId;

const LINK_TYPES = new Set(['director_of', 'owner_of', 'guarantor_for', 'shares_address']);

/** Entities connected to `entityId` by one non-account relationship (either direction). */
export function linkedEntities<R extends RuleRelationship>(
  entityId: string,
  rels: readonly R[],
): { entityId: string; rel: R }[] {
  return rels
    .filter((r) => LINK_TYPES.has(r.type) && (r.from === entityId || r.to === entityId))
    .map((r) => ({ entityId: r.from === entityId ? r.to : r.from, rel: r }));
}
