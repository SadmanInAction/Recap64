// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, type Arrow } from 'react-chessboard';
import { CLASS_INFO } from '../analysis/classify';
import { evalBarWhite, formatShort } from '../analysis/score';
import type { Classification, Score } from '../analysis/types';
import { ClassIcon } from './ClassIcon';

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: { from: string; to: string; classification?: Classification };
  arrows: Arrow[];
  score?: Score;
  onDrop: (from: string, to: string) => boolean;
}

export function BoardView({ fen, orientation, lastMove, arrows, score, onDrop }: Props) {
  const highlight = lastMove?.classification ? CLASS_INFO[lastMove.classification].color : '#f6f669';
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setSelected(null), [fen]);

  // Click-to-move: legal destinations of the selected piece.
  const targets = useMemo(() => {
    if (!selected) return new Set<string>();
    const moves = new Chess(fen).moves({ square: selected as Square, verbose: true });
    return new Set(moves.map((m) => m.to));
  }, [fen, selected]);

  const onSquareClick = (square: string) => {
    if (selected && targets.has(square)) {
      onDrop(selected, square);
      setSelected(null);
      return;
    }
    const piece = new Chess(fen).get(square as Square);
    const turn = fen.split(' ')[1];
    setSelected(piece && piece.color === turn && square !== selected ? square : null);
  };

  return (
    <div className="board-wrap">
      <EvalBar score={score} orientation={orientation} />
      <div className="board">
        <Chessboard
          options={{
            id: 'analysis-board',
            position: fen,
            boardOrientation: orientation,
            arrows,
            allowDrawingArrows: true,
            clearArrowsOnPositionChange: true,
            animationDurationInMs: 150,
            darkSquareStyle: { backgroundColor: '#739552' },
            lightSquareStyle: { backgroundColor: '#ebecd0' },
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? onDrop(sourceSquare, targetSquare) : false,
            onSquareClick: ({ square }) => onSquareClick(square),
            squareRenderer: ({ square, piece, children }) => {
              const isFrom = lastMove?.from === square;
              const isTo = lastMove?.to === square;
              return (
                <div className="sq">
                  {(isFrom || isTo) && <div className="sq-hl" style={{ background: highlight }} />}
                  {selected === square && <div className="sq-hl" style={{ background: '#f6f669' }} />}
                  {targets.has(square) && <div className={piece ? 'sq-capture' : 'sq-dot'} />}
                  {children}
                  {isTo && lastMove?.classification && (
                    <div className="sq-badge">
                      <ClassIcon type={lastMove.classification} size={26} />
                    </div>
                  )}
                </div>
              );
            },
          }}
        />
      </div>
    </div>
  );
}

function EvalBar({ score, orientation }: { score?: Score; orientation: 'white' | 'black' }) {
  const white = evalBarWhite(score);
  const whiteAhead = white >= 0.5;
  const flipped = orientation === 'black';
  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`}>
      <div className="eval-white" style={{ height: `${white * 100}%` }} />
      <span className={`eval-text ${whiteAhead ? 'on-white' : 'on-black'}`}>{formatShort(score)}</span>
    </div>
  );
}
