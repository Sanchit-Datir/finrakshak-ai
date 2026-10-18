import {
  Building2,
  FileText,
  Landmark,
  Newspaper,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Decorative login artwork: a borrower linked to the kinds of public records the
 * product reviews. It shows no real data and is hidden from assistive technology.
 */

interface Node {
  icon: LucideIcon;
  label: string;
  x: number;
  y: number;
}

const NODES: Node[] = [
  { icon: Building2, label: 'Related Companies', x: 24, y: 10 },
  { icon: Users, label: 'Directors & Stakeholders', x: 78, y: 10 },
  { icon: FileText, label: 'Court Cases', x: 86, y: 38 },
  { icon: Landmark, label: 'Regulatory Findings', x: 14, y: 46 },
  { icon: Newspaper, label: 'Media & Adverse News', x: 80, y: 62 },
];

const CENTER = { x: 50, y: 34 };
const WARNINGS = [
  { x: 68, y: 20 },
  { x: 32, y: 40 },
  { x: 67, y: 49 },
];

const LEGEND = [
  { label: 'Legal Cases', tone: 'bg-red-400' },
  { label: 'Related Entities', tone: 'bg-amber-400' },
  { label: 'Regulatory Notices', tone: 'bg-amber-400' },
  { label: 'Media Mentions', tone: 'bg-slate-400' },
];

function Card({ icon: Icon, label, x, y }: Node): React.JSX.Element {
  return (
    <div
      className="absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl bg-white/8 px-2 py-3 text-center text-[11px] leading-tight font-medium text-white ring-1 ring-teal-300/30 backdrop-blur-sm"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <Icon className="size-7 text-white" aria-hidden />
      {label}
    </div>
  );
}

function RiskCard(): React.JSX.Element {
  return (
    <div className="absolute bottom-0 left-1/2 w-[72%] -translate-x-1/2 rounded-2xl bg-white/8 p-4 ring-1 ring-teal-300/30 backdrop-blur-sm">
      <p className="text-sm font-semibold text-white">Risk Overview</p>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="size-24 shrink-0">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#0d9488" strokeWidth="12" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="12"
            strokeDasharray="138 251"
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="47" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
            Medium
          </text>
          <text x="50" y="61" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
            Risk
          </text>
        </svg>
        <ul className="space-y-1.5 text-[11px] text-white/85">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${l.tone}`} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function NetworkIllustration(): React.JSX.Element {
  return (
    <div aria-hidden className="relative h-[560px] w-full max-w-[460px]">
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {NODES.map((n) => (
          <line
            key={n.label}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={n.x}
            y2={n.y}
            stroke="#5eead4"
            strokeOpacity="0.45"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={CENTER.x}
          y1={CENTER.y}
          x2={50}
          y2={72}
          stroke="#5eead4"
          strokeOpacity="0.45"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {NODES.map((n) => (
        <Card key={n.label} {...n} />
      ))}
      <div
        className="absolute flex w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-xl bg-gradient-to-b from-sky-100 to-sky-300 px-3 py-4 text-sm font-semibold text-navy-deep shadow-[0_0_40px_rgba(94,234,212,0.45)]"
        style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%` }}
      >
        <Building2 className="size-12 text-[#12324a]" />
        Borrower
      </div>
      {WARNINGS.map((w) => (
        <span
          key={`${w.x}-${w.y}`}
          className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber-400/20 ring-2 ring-amber-400"
          style={{ left: `${w.x}%`, top: `${w.y}%` }}
        >
          <TriangleAlert className="size-4 text-amber-300" />
        </span>
      ))}
      <RiskCard />
    </div>
  );
}
