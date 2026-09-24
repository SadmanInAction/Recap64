// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

import type { Color, ParsedGame, TimeControl } from '../analysis/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Clock display like chess.com: "1:02:05", "2:59", and tenths under 20s ("0:09.8"). */
export function formatClock(seconds: number): string {
  if (seconds < 20) return `0:${seconds.toFixed(1).padStart(4, '0')}`;
  const t = Math.floor(seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}

/** Time spent on a move: "0.9s", "14s", "1:05". */
export function formatSpent(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  return `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}`;
}

/** { base: 180, increment: 2 } → "3+2"; { base: 90, increment: 0 } → "1.5 min". */
export function formatTimeControl(tc: TimeControl): string {
  const base = tc.base % 60 === 0 ? String(tc.base / 60) : (tc.base / 60).toFixed(1).replace(/\.0$/, '');
  return tc.increment ? `${base}+${tc.increment}` : `${base} min`;
}

export function hasClocks(game: ParsedGame): boolean {
  return game.moves.some((m) => m.clock !== undefined);
}

/** Time left on `color`'s clock in the position after `ply` half-moves. */
export function clockAt(game: ParsedGame, ply: number, color: Color): number | undefined {
  if (!hasClocks(game)) return undefined;
  for (let i = Math.min(ply, game.moves.length) - 1; i >= 0; i--) {
    const m = game.moves[i];
    if (m.color === color && m.clock !== undefined) return m.clock;
  }
  return game.timeControl?.base;
}
