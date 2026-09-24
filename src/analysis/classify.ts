// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

import { Chess, type Square } from 'chess.js';
import { other, winPctFor, whiteWinPct } from './score';
import type {
  Classification,
  Color,
  GameMove,
  MoveAnalysis,
  PositionAnalysis,
  Score,
} from './types';

export const CLASSIFICATIONS: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export const CLASS_INFO: Record<Classification, { label: string; color: string; symbol: string }> = {
  brilliant: { label: 'Brilliant', color: '#26c2a3', symbol: '!!' },
  great: { label: 'Great', color: '#5c8bb0', symbol: '!' },
  best: { label: 'Best', color: '#81b64c', symbol: '★' },
  excellent: { label: 'Excellent', color: '#96bc4b', symbol: '👍' },
  good: { label: 'Good', color: '#95b776', symbol: '✓' },
  book: { label: 'Book', color: '#a88865', symbol: '📖' },
  forced: { label: 'Forced', color: '#97a1ab', symbol: '→' },
  inaccuracy: { label: 'Inaccuracy', color: '#f7c631', symbol: '?!' },
  mistake: { label: 'Mistake', color: '#ffa459', symbol: '?' },
  miss: { label: 'Miss', color: '#ff7769', symbol: '✕' },
  blunder: { label: 'Blunder', color: '#fa412d', symbol: '??' },
};

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material balance (in pawns) from `color`'s point of view. */
function material(fen: string, color: Color): number {
  let sum = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = VALUES[ch.toLowerCase()];
    if (v === undefined) continue;
    const isWhite = ch === ch.toUpperCase();
    sum += (isWhite === (color === 'w') ? 1 : -1) * v;
  }
  return sum;
}

/**
 * Static exchange evaluation: material the side to move can win by a sequence of
 * captures on `square`, always capturing with the least valuable piece (legal moves only,
 * so pinned pieces are respected). Each side may stop capturing when it's unfavourable.
 */
function see(board: Chess, square: string): number {
  const captures = board
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured)
    .sort((a, b) => (VALUES[a.piece] || 100) - (VALUES[b.piece] || 100));
  if (captures.length === 0) return 0;
  const m = captures[0];
  board.move(m);
  const reply = see(board, square);
  board.undo();
  return Math.max(0, VALUES[m.captured!] - reply);
}

/**
 * Heuristic sacrifice detection:
 *  1. the moved piece (minor or bigger) can be won by the opponent via an exchange sequence, or
 *  2. in the engine's main line the opponent captures and we don't win the material straight back.
 */
function isSacrifice(move: GameMove, after: PositionAnalysis): boolean {
  const board = new Chess(move.after);
  const piece = board.get(move.to as Square);
  const captured = move.captured ? VALUES[move.captured] : 0;

  if (piece && VALUES[piece.type] >= 3 && captured - see(board, move.to) <= -1) return true;

  const pv = after.lines[0]?.pv ?? [];
  if (pv.length >= 2) {
    const before = material(move.before, move.color);
    const sim = new Chess(move.after);
    try {
      const reply = sim.move(uciToMove(pv[0]));
      if (!reply.captured) return false;
      sim.move(uciToMove(pv[1]));
    } catch {
      return false;
    }
    if (material(sim.fen(), move.color) <= before - 2) return true;
  }
  return false;
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

function isRecapture(move: GameMove, prev: GameMove | undefined) {
  return !!prev && !!prev.captured && !!move.captured && prev.to === move.to;
}

function mateText(score: Score | undefined, color: Color): string | null {
  if (!score || score.kind !== 'mate' || score.moves === 0) return null;
  return score.winner === color ? `mate in ${score.moves}` : null;
}

function buildComment(m: Omit<MoveAnalysis, 'comment'>, before: Score | undefined, after: Score | undefined): string {
  const best = m.bestSan && m.bestSan !== m.san ? ` The best move was ${m.bestSan}.` : '';
  const hadMate = mateText(before, m.color);
  const allowsMate = mateText(after, other(m.color));
  const extra =
    allowsMate && m.loss >= 10
      ? ` This allows ${allowsMate}.`
      : hadMate && !mateText(after, m.color)
        ? ` You had ${hadMate}.`
        : '';

  switch (m.classification) {
    case 'brilliant':
      return `${m.san} is brilliant! A strong sacrifice.`;
    case 'great':
      return `${m.san} is a great move. It was the only good move here.`;
    case 'best':
      return `${m.san} is the best move.`;
    case 'excellent':
      return `${m.san} is excellent.${best}`;
    case 'good':
      return `${m.san} is a good move.${best}`;
    case 'book':
      return `${m.san} is a book move.`;
    case 'forced':
      return `${m.san} was the only legal move.`;
    case 'inaccuracy':
      return `${m.san} is an inaccuracy.${extra}${best}`;
    case 'mistake':
      return `${m.san} is a mistake.${extra}${best}`;
    case 'miss':
      return `${m.san} is a miss. Your opponent made an error and you didn't take advantage of it.${best}`;
    case 'blunder':
      return `${m.san} is a blunder.${extra}${best}`;
  }
}

/** Label for a move judged only by the win % it loses (used for Retry attempts). */
export function classifyByLoss(loss: number): Classification {
  if (loss < 0.5) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
}

/** Per-move accuracy from win-% loss (Lichess formula). */
export function moveAccuracy(loss: number): number {
  const a = 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411;
  return Math.max(0, Math.min(100, a));
}

export function classifyMoves(
  moves: GameMove[],
  positions: PositionAnalysis[],
  bookPlies: number,
): MoveAnalysis[] {
  const result: MoveAnalysis[] = [];

  moves.forEach((move, i) => {
    const pos = positions[i];
    const next = positions[i + 1];
    const beforeScore = pos.lines[0]?.score;
    const afterScore = next.terminal === 'checkmate'
      ? ({ kind: 'mate', moves: 0, winner: move.color } as Score)
      : next.terminal === 'draw'
        ? ({ kind: 'cp', cp: 0 } as Score)
        : next.lines[0]?.score;

    const winBefore = beforeScore ? winPctFor(beforeScore, move.color) : 50;
    const winAfter = afterScore ? winPctFor(afterScore, move.color) : winBefore;
    const loss = Math.max(0, winBefore - winAfter);

    const bestUci = pos.lines[0]?.pv[0] ?? null;
    const bestSan = pos.lines[0]?.san[0] ?? null;
    const isBest = bestUci === move.uci;
    const legalMoves = new Chess(move.before).moves().length;
    const prev = result[i - 1];

    let classification: Classification;
    if (legalMoves === 1) {
      classification = 'forced';
    } else if (i < bookPlies) {
      classification = 'book';
    } else if (
      loss <= 2 &&
      winAfter >= 40 &&
      // not already completely winning — unless the sacrifice forces mate
      (winBefore < 95 || (afterScore?.kind === 'mate' && afterScore.winner === move.color)) &&
      isSacrifice(move, next)
    ) {
      classification = 'brilliant';
    } else if (
      (isBest || loss <= 1) &&
      pos.lines[1] &&
      winPctFor(pos.lines[0].score, move.color) - winPctFor(pos.lines[1].score, move.color) >= 20 &&
      !isRecapture(move, moves[i - 1]) &&
      winAfter >= 30
    ) {
      classification = 'great';
    } else if (isBest) {
      classification = 'best';
    } else if (loss < 2) {
      classification = 'excellent';
    } else if (loss < 5) {
      classification = 'good';
    } else if (loss >= 10 && prev && prev.loss >= 15 && winAfter >= 30) {
      classification = 'miss';
    } else if (loss < 10) {
      classification = 'inaccuracy';
    } else if (loss < 20) {
      classification = 'mistake';
    } else {
      classification = 'blunder';
    }

    const partial = {
      ...move,
      classification,
      winBefore,
      winAfter,
      loss,
      accuracy: moveAccuracy(loss),
      bestUci,
      bestSan,
      bestLine: pos.lines[0]?.san ?? [],
    };
    result.push({ ...partial, comment: buildComment(partial, beforeScore, afterScore) });
  });

  return result;
}

/**
 * Game accuracy per side, following Lichess: a volatility-weighted mean of move
 * accuracies averaged with their harmonic mean (punishes big mistakes).
 */
export function gameAccuracy(moves: MoveAnalysis[], positions: PositionAnalysis[]): Record<Color, number> {
  const wins = positions.map((p, i) => {
    if (p.terminal === 'checkmate') return moves[i - 1]?.color === 'w' ? 100 : 0;
    if (p.terminal === 'draw') return 50;
    return p.lines[0] ? whiteWinPct(p.lines[0].score) : 50;
  });

  const windowSize = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));
  const windows: number[][] = [];
  for (let k = 0; k < Math.min(windowSize - 2, moves.length); k++) windows.push(wins.slice(0, windowSize));
  for (let k = 0; k + windowSize <= wins.length; k++) windows.push(wins.slice(k, k + windowSize));

  const weights = windows.map((xs) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return Math.max(0.5, Math.min(12, sd));
  });

  const out = { w: 0, b: 0 } as Record<Color, number>;
  for (const color of ['w', 'b'] as Color[]) {
    let wSum = 0;
    let wTotal = 0;
    let invSum = 0;
    let n = 0;
    moves.forEach((m, i) => {
      if (m.color !== color) return;
      const weight = weights[i] ?? 1;
      wSum += m.accuracy * weight;
      wTotal += weight;
      invSum += 1 / Math.max(m.accuracy, 1);
      n++;
    });
    out[color] = n === 0 ? 0 : (wSum / wTotal + n / invSum) / 2;
  }
  return out;
}
