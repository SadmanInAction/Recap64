// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

import type { UciScore } from '../engine/Engine';
import type { Color, Score } from './types';

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Converts a side-to-move UCI score into a White-perspective score. */
export function fromUci(score: UciScore, sideToMove: Color): Score {
  if (score.type === 'cp') {
    return { kind: 'cp', cp: sideToMove === 'w' ? score.value : -score.value };
  }
  // mate 0 / negative mate: the side to move is getting mated
  if (score.value > 0) return { kind: 'mate', moves: score.value, winner: sideToMove };
  return { kind: 'mate', moves: -score.value, winner: other(sideToMove) };
}

/**
 * Win probability for White (0-100) using the Lichess logistic model,
 * fitted on real games: https://lichess.org/page/accuracy
 */
export function whiteWinPct(score: Score): number {
  if (score.kind === 'mate') return score.winner === 'w' ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function winPctFor(score: Score, color: Color): number {
  const w = whiteWinPct(score);
  return color === 'w' ? w : 100 - w;
}

/** Human readable evaluation, e.g. "+1.35", "-0.40", "M3", "-M2". */
export function formatScore(score: Score | undefined): string {
  if (!score) return '';
  if (score.kind === 'mate') {
    if (score.moves === 0) return score.winner === 'w' ? '1-0' : '0-1';
    return `${score.winner === 'w' ? '' : '-'}M${score.moves}`;
  }
  const v = score.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}

/** Short form for the eval bar ("1.3", "M3"). */
export function formatShort(score: Score | undefined): string {
  if (!score) return '';
  if (score.kind === 'mate') return score.moves === 0 ? '#' : `M${score.moves}`;
  return Math.abs(score.cp / 100).toFixed(1);
}

/** Share of the eval bar that is White (0..1). */
export function evalBarWhite(score: Score | undefined): number {
  if (!score) return 0.5;
  if (score.kind === 'mate') return score.winner === 'w' ? 1 : 0;
  const w = whiteWinPct(score) / 100;
  return Math.max(0.04, Math.min(0.96, w));
}
