/** Post-disbursement public-records watch: watched loans and their daily checks. */

import type { PrSubject, PublicWatch, WatchEvent } from '../../domain/schemas.js';
import { mutate, nowIso } from '../store.js';
import { audit } from './internal.js';

export type NewWatch = Pick<
  PublicWatch,
  'loanRef' | 'borrowerName' | 'cin' | 'amountMinor' | 'disbursedOn' | 'branchId'
>;

/** Adds a disbursed loan's borrower to the public-records watch. Returns the watch id. */
export function addPublicWatch(actor: string, input: NewWatch): string {
  let id = '';
  mutate((d) => {
    id = `W-${d.publicWatches.length + 1}`;
    const at = nowIso();
    d.publicWatches.push({
      ...input,
      id,
      loanId: null,
      createdAt: at,
      createdBy: actor,
      lastCheck: null,
      events: [],
      audit: [audit(actor, 'Watch added', `${input.loanRef}, disbursed ${input.disbursedOn}`)],
    });
  });
  return id;
}

/**
 * Makes sure every disbursed loan in the loan book has a watch (idempotent). Watches are
 * created from the loan and its borrower: no data entry. Returns how many were added.
 */
export function syncLoanWatches(actor: string): number {
  let added = 0;
  mutate((d) => {
    const watched = new Set(d.publicWatches.map((w) => w.loanId));
    for (const loan of d.loans) {
      if (watched.has(loan.id)) continue;
      const b = d.borrowers.find((x) => x.id === loan.borrowerId);
      if (b === undefined) continue;
      added += 1;
      d.publicWatches.push({
        id: `W-${d.publicWatches.length + 1}`,
        loanId: loan.id,
        loanRef: loan.id,
        borrowerName: b.name,
        cin: b.registrationNo,
        amountMinor: loan.amountMinor,
        disbursedOn: loan.disbursedAt.slice(0, 10),
        branchId: loan.branchId,
        createdAt: nowIso(),
        createdBy: actor,
        lastCheck: null,
        events: [],
        audit: [audit(actor, 'Watch added automatically', `From the loan book (${loan.id})`)],
      });
    }
  });
  return added;
}

/** Saves a watch check; new events are appended (never edited or removed). */
export function recordWatchCheck(
  watchId: string,
  actor: string,
  result: {
    asOf: string;
    subject: PrSubject;
    newEvents: WatchEvent[];
    datasetBuiltAt: string | null;
  },
): void {
  mutate((d) => {
    const w = d.publicWatches.find((x) => x.id === watchId);
    if (w === undefined) throw new Error(`Watch ${watchId} not found`);
    const checkedAt = nowIso();
    w.lastCheck = {
      checkedAt,
      asOf: result.asOf,
      datasetBuiltAt: result.datasetBuiltAt,
      subject: result.subject,
    };
    w.events.push(...result.newEvents);
    w.audit.push(
      audit(
        actor,
        'Watch checked',
        `As of ${result.asOf}: ${result.newEvents.length} new public record(s)`,
      ),
    );
  });
}
