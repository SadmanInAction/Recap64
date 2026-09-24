import { useEffect, useRef } from 'react';
import type { MoveAnalysis } from '../analysis/types';
import { ClassIcon } from './ClassIcon';

interface Props {
  moves: MoveAnalysis[];
  current: number; // current ply (0 = start)
  onSelect: (ply: number) => void;
}

export function MoveList({ moves, current, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.move.active');
    if (el && listRef.current) {
      const box = listRef.current;
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) {
        box.scrollTo({ top: top - box.clientHeight / 2, behavior: 'smooth' });
      }
    }
  }, [current]);

  const rows: [MoveAnalysis | undefined, MoveAnalysis | undefined][] = [];
  const offset = moves[0]?.color === 'b' ? 1 : 0; // game started with Black to move
  if (offset) rows.push([undefined, moves[0]]);
  for (let i = offset; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);

  const cell = (m: MoveAnalysis | undefined) =>
    m ? (
      <button className={`move ${m.ply === current ? 'active' : ''}`} onClick={() => onSelect(m.ply)}>
        <ClassIcon type={m.classification} size={16} />
        <span>{m.san}</span>
      </button>
    ) : (
      <span className="move empty">…</span>
    );

  return (
    <div className="move-list" ref={listRef}>
      {rows.map(([w, b], i) => (
        <div className="move-row" key={i}>
          <span className="move-num">{(w ?? b)!.before.split(' ')[5]}.</span>
          {cell(w)}
          {cell(b)}
        </div>
      ))}
    </div>
  );
}
