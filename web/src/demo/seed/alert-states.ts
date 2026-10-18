/** Triage state of some monitoring alerts (all others start as New). */

import type { AlertState } from '../../domain/schemas.js';
import { monitoringAlertId } from '../../lib/monitoring.js';
import { audit } from './audit.js';
import type { SeedContext } from './context.js';

export function demoAlertStates(ctx: SeedContext, circ1: string): Record<string, AlertState> {
  const { ago, analyst, investigator } = ctx;
  const st = (
    status: AlertState['status'],
    actor: string,
    days: number,
    reason: string | null,
    note?: string,
  ): AlertState => ({
    status,
    assignee: actor,
    resolutionReason: reason,
    notes:
      note === undefined
        ? []
        : [{ id: `an-${days}-${status}`, author: actor, at: ago(days, 15), text: note }],
    audit: [
      audit(
        ago(days, 15),
        actor,
        'Status changed',
        `New → ${status.replace(/_/g, ' ')}${reason === null ? '' : `: ${reason}`}`,
      ),
    ],
  });
  const alertStates: Record<string, AlertState> = {
    [monitoringAlertId('rapid_onward', 'L-2026-0108')]: st(
      'resolved',
      analyst,
      30,
      'Payment to authorised tractor dealer matches quotation SAE/Q/0912; invoice and RC copy verified at branch.',
      'Invoice SAE/2026/311 and RTO registration copy received.',
    ),
    [monitoringAlertId('circular', 'L-2026-0110', circ1)]: st(
      'escalated',
      investigator,
      18,
      null,
      'Escalated to CASE-2026-014.',
    ),
    [monitoringAlertId('linked_counterparty', 'L-2026-0110', 'c-bhosale-infra')]: st(
      'in_review',
      investigator,
      19,
      null,
    ),
    [monitoringAlertId('rapid_onward', 'L-2026-0110')]: st('in_review', analyst, 20, null),
    [monitoringAlertId('cash_split', 'L-2026-0112')]: st(
      'in_review',
      analyst,
      6,
      null,
      'Borrower says cash paid to installation labour; vouchers requested.',
    ),
  };
  return alertStates;
}
