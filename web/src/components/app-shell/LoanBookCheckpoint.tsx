import { IndianRupee } from 'lucide-react';
import { Link } from 'react-router';
import type { Priority } from '../../domain/schemas.js';
import type { LoanBookPulse } from '../../lib/nav-counts.js';
import { cn } from '../ui/cn.js';

const SEGMENTS: { p: Priority; label: string; bar: string; text: string }[] = [
  { p: 'routine', label: 'routine', bar: 'bg-rail-post', text: 'text-rail-muted' },
  {
    p: 'needs_attention',
    label: 'attention',
    bar: 'bg-rail-attention',
    text: 'text-rail-attention',
  },
  { p: 'urgent', label: 'urgent', bar: 'bg-rail-urgent', text: 'text-rail-urgent' },
];

/**
 * The "₹ Disbursed" milestone between pre-sanction and post-disbursement on the journey line, with
 * the loan book split by review priority (each part labelled in text, not colour only).
 */
export function LoanBookCheckpoint({
  pulse,
  collapsed,
  onNavigate,
}: {
  pulse: LoanBookPulse;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}): React.JSX.Element {
  const summary = SEGMENTS.map((s) => `${pulse.byPriority[s.p]} ${s.label}`).join(', ');
  const label = `Disbursed: ${pulse.total} loans in the loan book (${summary}). Open the loan book`;
  const node = (
    <span className="from-rail-pre to-rail-post text-navy-deep relative z-10 grid size-[22px] shrink-0 place-items-center rounded-full bg-gradient-to-br ring-4 ring-rail">
      <IndianRupee className="size-3" strokeWidth={3} aria-hidden />
    </span>
  );
  if (collapsed) {
    return (
      <Link
        to="/monitoring"
        title={label}
        aria-label={label}
        className="mx-auto my-2 block w-fit"
        onClick={onNavigate}
      >
        {node}
      </Link>
    );
  }
  return (
    <Link
      to="/monitoring"
      aria-label={label}
      onClick={onNavigate}
      className="group relative my-1 block rounded-lg py-1.5 pr-2 pl-[10px] hover:bg-white/[0.04]"
    >
      <span className="flex items-center gap-2.5">
        {node}
        <span className="text-[12px] font-semibold tracking-wide text-white">Disbursed</span>
        <span className="text-rail-muted tabular ml-auto text-[11px]">{pulse.total} loans</span>
      </span>
      <span
        aria-hidden
        className="mt-1.5 ml-[32px] flex h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        {SEGMENTS.map((s) =>
          pulse.byPriority[s.p] === 0 ? null : (
            <span
              key={s.p}
              className={cn('grow-x h-full', s.bar)}
              style={{ width: `${(pulse.byPriority[s.p] / Math.max(1, pulse.total)) * 100}%` }}
            />
          ),
        )}
      </span>
      <span aria-hidden className="mt-1 ml-[32px] flex gap-2 text-[10.5px]">
        {SEGMENTS.map((s) => (
          <span key={s.p} className={cn('tabular', s.text)}>
            {pulse.byPriority[s.p]} {s.label}
          </span>
        ))}
      </span>
    </Link>
  );
}
