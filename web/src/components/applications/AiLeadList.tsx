import { ChevronRight, FileText, Landmark } from 'lucide-react';
import { LEAD_SOURCE_LABEL, type Lead } from '../../lib/ai-leads.js';
import { Badge } from '../ui/Badge.js';
import { PriorityBadge } from '../ui/StatusBadges.js';

/** The few top leads, one line each; a click (or Enter/Space) opens the evidence under a lead. */
export function AiLeadList({ leads }: { leads: readonly Lead[] }): React.JSX.Element {
  return (
    <ol className="space-y-2" aria-label="Top leads">
      {leads.map((l) => (
        <li key={l.id} className="border-line rounded-lg border">
          <details className="group">
            <summary className="focus-visible:ring-teal flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg p-3 text-sm outline-none focus-visible:ring-2">
              <ChevronRight
                className="text-muted size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                aria-hidden
              />
              <PriorityBadge priority={l.priority} />
              <Badge tone="neutral" icon={l.source === 'documents' ? FileText : Landmark}>
                {LEAD_SOURCE_LABEL[l.source]}
              </Badge>
              <span className="min-w-0 basis-full break-words sm:basis-0 sm:flex-1">{l.text}</span>
            </summary>
            <div className="border-line border-t px-3 py-2 text-xs">
              <h5 className="font-semibold">Evidence</h5>
              {l.evidence.length === 0 ? (
                <p className="text-muted mt-1">No evidence lines were kept for this lead.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 break-words">
                  {l.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
