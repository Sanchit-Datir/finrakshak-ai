import { useId } from 'react';

/** Tiny decorative trend line; the numbers it shows are always stated in text nearby. */
export function Sparkline({
  values,
  color = 'var(--color-primary)',
  className,
}: {
  values: number[];
  color?: string;
  className?: string;
}): React.JSX.Element | null {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 36;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h}Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last !== undefined && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
    </svg>
  );
}
