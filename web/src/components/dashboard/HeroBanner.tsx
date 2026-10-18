import { Bell, FilePlus2, ScanLine, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

const QUICK = [
  { to: '/applications/new', icon: FilePlus2, label: 'New application' },
  { to: '/applications/new?capture=1', icon: ScanLine, label: 'Scan documents' },
  { to: '/borrowers', icon: Users, label: 'Find a borrower' },
  { to: '/alerts?view=open', icon: Bell, label: 'Open alerts' },
];

/** Greeting banner with a one-line situation summary and quick actions. */
export function HeroBanner({
  greeting,
  summary,
  controls,
}: {
  greeting: string;
  summary: ReactNode;
  controls: ReactNode;
}): React.JSX.Element {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_85%_0%,#0f4c5c_0%,#12324a_45%,#0b253b_100%)] p-6 text-white shadow-[var(--shadow-card)] sm:p-8">
      <svg
        aria-hidden
        viewBox="0 0 400 200"
        className="pointer-events-none absolute -top-6 right-0 h-[130%] opacity-25"
      >
        {[
          [300, 60],
          [360, 120],
          [250, 140],
          [330, 30],
          [210, 70],
        ].map(([x, y], i, all) => (
          <g key={`${x}-${y}`}>
            {i > 0 && (
              <line
                x1={all[0]?.[0]}
                y1={all[0]?.[1]}
                x2={x}
                y2={y}
                stroke="#5eead4"
                strokeWidth="1.2"
              />
            )}
            <circle cx={x} cy={y} r={i === 0 ? 9 : 5} fill="#5eead4" />
          </g>
        ))}
      </svg>
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[30px]">{greeting}</h1>
          <p className="mt-2 text-sm text-white/80 sm:text-base">{summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {QUICK.map(({ to, icon: Icon, label }) => (
              <Link
                key={label}
                to={to}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <Icon className="size-4 text-teal-200" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-controls flex flex-wrap items-end gap-2">{controls}</div>
      </div>
    </section>
  );
}
