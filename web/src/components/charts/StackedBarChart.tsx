import { useState } from 'react';

export interface Series {
  key: string;
  label: string;
  color: string;
}
export interface Bucket {
  label: string;
  values: Record<string, number>;
}

/**
 * Stacked bar chart with legend, hover/focus tooltip and a screen-reader table.
 * Colours come from CSS tokens; each series is also named in the legend/tooltip.
 */
export function StackedBarChart({
  buckets,
  series,
  title,
  height = 220,
}: {
  buckets: Bucket[];
  series: Series[];
  title: string;
  height?: number;
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(
    1,
    ...buckets.map((b) => series.reduce((s, x) => s + (b.values[x.key] ?? 0), 0)),
  );
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const W = 600;
  const padL = 32;
  const padB = 28;
  const plotH = height - padB - 8;
  const bw = Math.min(42, ((W - padL) / Math.max(1, buckets.length)) * 0.6);
  const step = (W - padL) / Math.max(1, buckets.length);
  const active = hover === null ? undefined : buckets[hover];
  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="w-full"
          role="img"
          aria-label={`${title}. Data table follows.`}
        >
          {ticks.map((t) => {
            const y = 8 + plotH - (t / top) * plotH;
            return (
              <g key={t}>
                <line
                  x1={padL}
                  x2={W}
                  y1={y}
                  y2={y}
                  stroke="var(--color-line)"
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
                <text
                  x={padL - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--color-muted)"
                  className="tabular"
                >
                  {t}
                </text>
              </g>
            );
          })}
          {buckets.map((b, i) => {
            let acc = 0;
            const x = padL + i * step + (step - bw) / 2;
            return (
              <g
                key={b.label}
                tabIndex={0}
                role="button"
                aria-label={`${b.label}: ${series.map((s) => `${s.label} ${b.values[s.key] ?? 0}`).join(', ')}`}
                onMouseEnter={() => {
                  setHover(i);
                }}
                onMouseLeave={() => {
                  setHover(null);
                }}
                onFocus={() => {
                  setHover(i);
                }}
                onBlur={() => {
                  setHover(null);
                }}
                className="cursor-default outline-none"
              >
                <rect
                  x={padL + i * step}
                  y={8}
                  width={step}
                  height={plotH}
                  fill={hover === i ? 'var(--color-primary-soft)' : 'transparent'}
                  rx={6}
                />
                {series.map((s) => {
                  const v = b.values[s.key] ?? 0;
                  if (v === 0) return null;
                  const h = (v / top) * plotH;
                  acc += h;
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={8 + plotH - acc}
                      width={bw}
                      height={Math.max(h - 1.5, 1)}
                      fill={s.color}
                      rx={3}
                    />
                  );
                })}
                <text
                  x={padL + i * step + step / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--color-muted)"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
        {active !== undefined && (
          <div
            role="status"
            className="card pointer-events-none absolute top-1 right-1 px-3 py-2 text-xs"
            style={{ boxShadow: 'var(--shadow-pop)' }}
          >
            <p className="mb-1 font-semibold">{active.label}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}:{' '}
                <span className="tabular font-semibold">{active.values[s.key] ?? 0}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              {series.map((s) => (
                <td key={s.key}>{b.values[s.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 10) * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1; v += step) out.push(v);
  if ((out[out.length - 1] ?? 0) < max) out.push((out[out.length - 1] ?? 0) + step);
  return out;
}
