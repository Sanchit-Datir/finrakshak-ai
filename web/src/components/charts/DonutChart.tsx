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
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
      <svg
        viewBox="0 0 200 200"
        className="size-44 shrink-0"
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
      <ul className="w-full space-y-1.5">
        {slices.map((s) => {
          const Icon = s.icon;
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
          const body = (
            <>
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-sm"
                style={{ background: s.color }}
              />
              <Icon className="text-muted size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-sm">{s.label}</span>
              <span className="tabular text-sm font-semibold">{s.value}</span>
              <span className="text-muted tabular w-10 text-right text-xs">{pct}%</span>
            </>
          );
          const cls = 'hover:bg-surface-2 flex items-center gap-2 rounded-lg px-2 py-1.5';
          return (
            <li key={s.key} title={s.help}>
              {s.href === undefined ? (
                <div className={cls}>{body}</div>
              ) : (
                <Link
                  to={s.href}
                  className={cls}
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
