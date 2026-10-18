import { ChevronRight } from 'lucide-react';

/** A collapsed section holding one half's full result, so nothing the AI returned is lost. */
export function AiHalfSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <details className="group border-line rounded-lg border">
      <summary className="focus-visible:ring-teal flex cursor-pointer list-none items-center gap-2 rounded-lg p-3 text-sm outline-none focus-visible:ring-2">
        <ChevronRight
          className="text-muted size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        <span className="font-semibold">{title}</span>
        <span className="text-muted text-xs">{hint}</span>
      </summary>
      <div className="border-line border-t p-3">{children}</div>
    </details>
  );
}
