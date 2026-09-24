import { useRef } from 'react';
import { CLASS_INFO } from '../analysis/classify';
import { whiteWinPct } from '../analysis/score';
import type { MoveAnalysis, PositionAnalysis } from '../analysis/types';

interface Props {
  positions: PositionAnalysis[];
  moves?: MoveAnalysis[];
  total?: number; // total positions (for progress rendering)
  current?: number;
  onSelect?: (ply: number) => void;
}

const W = 600;
const H = 110;
const MARKED = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);

export function EvalGraph({ positions, moves, total, current, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const n = Math.max(2, total ?? positions.length);
  const xr = (i: number) => i / (n - 1); // 0..1
  const yr = (win: number) => 1 - win / 100; // 0..1

  const values = positions.map((p, i) => {
    if (p.terminal === 'checkmate') return moves?.[i - 1]?.color === 'w' ? 100 : 0;
    if (p.terminal === 'draw') return 50;
    return p.lines[0] ? whiteWinPct(p.lines[0].score) : 50;
  });

  const area =
    values.length > 0
      ? `M0,${H} ` +
        values.map((v, i) => `L${xr(i) * W},${yr(v) * H}`).join(' ') +
        ` L${xr(values.length - 1) * W},${H} Z`
      : '';

  const handleClick = (e: React.MouseEvent) => {
    if (!onSelect || !ref.current || values.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSelect(Math.max(0, Math.min(values.length - 1, Math.round(ratio * (n - 1)))));
  };

  return (
    <div
      ref={ref}
      className={`eval-graph ${onSelect ? 'clickable' : ''}`}
      onClick={handleClick}
      role="img"
      aria-label="Evaluation graph"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect width={W} height={H} fill="#403d39" />
        <path d={area} fill="#f0f0f0" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#8b8987" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {current !== undefined && (
          <line
            x1={xr(current) * W}
            x2={xr(current) * W}
            y1="0"
            y2={H}
            stroke="#81b64c"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {moves?.map((m) =>
        MARKED.has(m.classification) && values[m.ply] !== undefined ? (
          <span
            key={m.ply}
            className="graph-dot"
            title={`${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'} ${m.san} — ${CLASS_INFO[m.classification].label}`}
            style={{
              left: `${xr(m.ply) * 100}%`,
              top: `${yr(values[m.ply]) * 100}%`,
              background: CLASS_INFO[m.classification].color,
            }}
          />
        ) : null,
      )}
    </div>
  );
}
