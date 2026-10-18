import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
  help?: string;
  href?: string;
}

/** Donut with an icon+text legend so categories never depend on colour alone. */
export function DonutChart({
  slices,
  title,
  centerLabel,
}: {
  slices: Slice[];
  title: string;
  centerLabel: string;
}): React.JSX.Element {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const focused = slices.find((s) => s.key === hover);
  return (
    <div className="flex flex-col items-center gap-6 md:flex-row">
      <svg
        viewBox="0 0 200 200"
        className="size-40 shrink-0"
        role="img"
        aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}
      >
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--color-line)" strokeWidth="26" />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.key}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.key ? 30 : 26}
                strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 100 100)"
              />
            );
            offset += len;
            return el;
          })}
        <text
          x="100"
          y="96"
          textAnchor="middle"
          fontSize="30"
          fontWeight="700"
          fill="var(--color-ink)"
          className="tabular"
        >
          {focused?.value ?? total}
        </text>
        <text x="100" y="118" textAnchor="middle" fontSize="11" fill="var(--color-muted)">
          {focused?.label ?? centerLabel}
        </text>
      </svg>
      <ul className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
        {slices.map((s) => {
          const Icon = s.icon;
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
          const body = (
            <>
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: s.color }}
              />
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}
                >
                  <Icon className="size-4" style={{ color: s.color }} />
                </span>
                {s.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-bold">{s.value}</span>
                <span className="text-muted tabular text-sm">
                  {pct}% of {total}
                </span>
              </span>
              <span aria-hidden className="bg-surface-2 block h-1.5 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, background: s.color }}
                />
              </span>
              {s.href !== undefined && (
                <span className="text-primary text-sm font-semibold">View →</span>
              )}
            </>
          );
          const cls =
            'border-line bg-surface relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border p-4 pt-5';
          return (
            <li key={s.key} title={s.help}>
              {s.href === undefined ? (
                <div className={cls}>{body}</div>
              ) : (
                <Link
                  to={s.href}
                  className={`${cls} hover:border-primary/50 hover:shadow-sm`}
                  onMouseEnter={() => {
                    setHover(s.key);
                  }}
                  onMouseLeave={() => {
                    setHover(null);
                  }}
                  onFocus={() => {
                    setHover(s.key);
                  }}
                  onBlur={() => {
                    setHover(null);
                  }}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
