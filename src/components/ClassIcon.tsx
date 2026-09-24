import { CLASS_INFO } from '../analysis/classify';
import type { Classification } from '../analysis/types';

// Material Design icon paths (Apache 2.0)
const PATHS: Partial<Record<Classification, string>> = {
  best: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  excellent:
    'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  good: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  book: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
  forced: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  miss: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
};

export function ClassIcon({ type, size = 18 }: { type: Classification; size?: number }) {
  const info = CLASS_INFO[type];
  const path = PATHS[type];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="class-icon" aria-label={info.label}>
      <title>{info.label}</title>
      <circle cx="12" cy="12" r="12" fill={info.color} />
      {path ? (
        <g transform="translate(5 5) scale(0.583)">
          <path d={path} fill="#fff" />
        </g>
      ) : (
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={info.symbol.length > 1 ? 11 : 14}
          fontWeight="800"
          fill="#fff"
          fontFamily="system-ui, sans-serif"
        >
          {info.symbol}
        </text>
      )}
    </svg>
  );
}
