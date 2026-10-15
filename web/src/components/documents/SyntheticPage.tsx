import type { Region } from '../../domain/schemas.js';
import { PAGE_H, PAGE_W, type Sample } from '../../demo/samples.js';
import { hasDevanagari } from '../../lib/text.js';

/** Renders a synthetic demo document as SVG, optionally highlighting a source region. */
export function SyntheticPage({
  sample,
  highlight,
  label,
}: {
  sample: Sample;
  highlight: Region | null;
  label: string;
}): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full bg-[#fdfbf5]"
    >
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill="#fdfbf5" />
      <rect
        x="10"
        y="10"
        width={PAGE_W - 20}
        height={PAGE_H - 20}
        fill="none"
        stroke="#c9bfa6"
        strokeWidth="1.5"
      />
      {sample.rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="none"
          stroke="#b9ad90"
          strokeWidth="1"
        />
      ))}
      <text
        x={PAGE_W / 2}
        y={PAGE_H / 2 + 60}
        textAnchor="middle"
        fontSize="54"
        fill="#d9cfb8"
        opacity="0.35"
        transform={`rotate(-28 ${PAGE_W / 2} ${PAGE_H / 2})`}
        fontFamily="Inter Variable, sans-serif"
        fontWeight="700"
      >
        SYNTHETIC SAMPLE
      </text>
      {sample.lines.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          fontSize={l.size ?? 14}
          fontWeight={l.weight ?? 400}
          textAnchor={l.anchor ?? 'start'}
          fill={l.hand === true ? '#1f3a8a' : l.muted === true ? '#7c7464' : '#2b2a26'}
          fontFamily={
            hasDevanagari(l.text)
              ? 'Noto Sans Devanagari, sans-serif'
              : 'Inter Variable, sans-serif'
          }
          fontStyle={l.hand === true ? 'italic' : 'normal'}
          transform={l.hand === true ? `rotate(-1.2 ${l.x} ${l.y})` : undefined}
          opacity={l.hand === true && l.muted === true ? 0.55 : 1}
        >
          {l.text}
        </text>
      ))}
      {highlight !== null && (
        <g>
          <rect
            x={highlight.x - 4}
            y={highlight.y - 4}
            width={highlight.w + 8}
            height={highlight.h + 8}
            rx="6"
            fill="rgba(37,99,235,0.14)"
            stroke="#2563eb"
            strokeWidth="2.5"
          />
          <rect
            x={highlight.x - 4}
            y={highlight.y - 24}
            width="92"
            height="18"
            rx="4"
            fill="#2563eb"
          />
          <text
            x={highlight.x + 2}
            y={highlight.y - 11}
            fontSize="11"
            fill="#fff"
            fontFamily="Inter Variable, sans-serif"
            fontWeight="600"
          >
            Source region
          </text>
        </g>
      )}
    </svg>
  );
}
