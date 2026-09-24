import { Chess } from 'chess.js';
import type { Engine } from '../engine/Engine';
import { classifyMoves, gameAccuracy, CLASSIFICATIONS, uciToMove } from './classify';
import { fromUci } from './score';
import type {
  Classification,
  Color,
  EngineLine,
  GameAnalysis,
  ParsedGame,
  PositionAnalysis,
  TimeControl,
} from './types';
import type { UciLine } from '../engine/Engine';

/** A pasted PGN may hold several games (e.g. an exported archive); keep only the first. */
function firstGame(pgn: string): string {
  const out: string[] = [];
  let seenMoves = false;
  for (const line of pgn.trim().split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('[') && seenMoves) break; // header of the next game
    if (t && !t.startsWith('[')) seenMoves = true;
    out.push(line);
  }
  return out.join('\n');
}

export function parsePgn(input: string): ParsedGame {
  const pgn = firstGame(input);
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (e) {
    throw new Error(`Could not read PGN: ${(e as Error).message}`);
  }
  const history = chess.history({ verbose: true });
  if (history.length === 0) throw new Error('The PGN contains no moves.');
  // Drop placeholder values ("?", "????.??.??") so callers can fall back to "White"/"Black".
  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders()).filter(([, v]) => v && !/^[?.]+$/.test(v)),
  );
  const timeControl = parseTimeControl(headers.TimeControl);

  // Comments are keyed by the FEN after the move; clocks look like {[%clk 0:02:59.9]}.
  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const clocks = history.map((m) => parseClock(comments.get(m.after)));
  const lastClock: Record<Color, number | undefined> = { w: timeControl?.base, b: timeControl?.base };
  const spent = history.map((m, i) => {
    const prev = lastClock[m.color];
    const now = clocks[i];
    if (now === undefined) return undefined;
    lastClock[m.color] = now;
    return prev === undefined ? undefined : Math.max(0, prev - now + (timeControl?.increment ?? 0));
  });

  return {
    pgn,
    headers,
    timeControl,
    startFen: history[0].before,
    moves: history.map((m, i) => ({
      ply: i + 1,
      color: m.color,
      san: m.san,
      uci: m.from + m.to + (m.promotion ?? ''),
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      before: m.before,
      after: m.after,
      clock: clocks[i],
      timeSpent: spent[i],
    })),
  };
}

/** "180+2" → { base: 180, increment: 2 }. Daily ("1/86400") and unlimited ("-") games have no clock. */
function parseTimeControl(tc?: string): TimeControl | undefined {
  const m = tc?.match(/^(\d+)(?:\+(\d+(?:\.\d+)?))?$/);
  return m ? { base: Number(m[1]), increment: Number(m[2] ?? 0) } : undefined;
}

/** "[%clk 0:02:59.9]" → 179.9 seconds. */
function parseClock(comment?: string): number | undefined {
  const m = comment?.match(/\[%clk\s+(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

/** Converts a UCI line to SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uci: string[], max = 12): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const u of uci.slice(0, max)) {
    try {
      out.push(chess.move(uciToMove(u)).san);
    } catch {
      break;
    }
  }
  return out;
}

export function toEngineLines(fen: string, lines: UciLine[]): EngineLine[] {
  const stm = fen.split(' ')[1] as Color;
  return lines.map((l) => ({
    score: fromUci(l.score, stm),
    depth: l.depth,
    pv: l.pv,
    san: uciLineToSan(fen, l.pv),
  }));
}

export function terminalState(fen: string): PositionAnalysis['terminal'] {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isDraw() || chess.isStalemate()) return 'draw';
  return undefined;
}

let openingsPromise: Promise<Record<string, string>> | null = null;
export function loadOpenings(): Promise<Record<string, string>> {
  openingsPromise ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return openingsPromise;
}

const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export interface AnalyzeOptions {
  depth: number;
  movetime?: number; // per-position time cap
  onProgress?: (done: number, total: number, positions: PositionAnalysis[]) => void;
  isCancelled?: () => boolean;
}

export async function analyzeGame(
  engine: Engine,
  game: ParsedGame,
  opts: AnalyzeOptions,
): Promise<GameAnalysis | null> {
  const fens = [game.startFen, ...game.moves.map((m) => m.after)];
  const positions: PositionAnalysis[] = [];

  await engine.newGame();
  for (let i = 0; i < fens.length; i++) {
    if (opts.isCancelled?.()) return null;
    const fen = fens[i];
    const terminal = terminalState(fen);
    if (terminal) {
      positions.push({ fen, lines: [], terminal });
    } else {
      const res = await engine.analyze(fen, { depth: opts.depth, movetime: opts.movetime, multiPv: 2, isCancelled: opts.isCancelled });
      positions.push({ fen, lines: toEngineLines(fen, res.lines) });
    }
    opts.onProgress?.(i + 1, fens.length, positions);
  }
  if (opts.isCancelled?.()) return null;

  // Opening book: consecutive plies from the start whose position is a named opening.
  const openings = await loadOpenings();
  let bookPlies = 0;
  let opening: string | null = null;
  const standardStart = game.startFen === new Chess().fen();
  game.moves.forEach((m, i) => {
    const name = standardStart ? openings[epd(m.after)] : undefined;
    if (name) {
      opening = name;
      if (bookPlies === i) bookPlies = i + 1;
    }
  });
  opening ??= game.headers.Opening ?? ecoFromUrl(game.headers.ECOUrl) ?? null;

  const moves = classifyMoves(game.moves, positions, bookPlies);
  const counts = { w: {}, b: {} } as Record<Color, Record<Classification, number>>;
  for (const c of ['w', 'b'] as Color[]) {
    for (const k of CLASSIFICATIONS) counts[c][k] = 0;
  }
  moves.forEach((m) => counts[m.color][m.classification]++);

  return {
    game,
    positions,
    moves,
    accuracy: gameAccuracy(moves, positions),
    counts,
    opening,
    depth: opts.depth,
  };
}

function ecoFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const slug = url.split('/').pop();
  return slug?.replace(/-/g, ' ');
}
