export type Color = 'w' | 'b';

/** Evaluation from White's point of view. */
export type Score =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; moves: number; winner: Color }; // moves = 0 means checkmate on the board

export interface EngineLine {
  score: Score;
  depth: number;
  pv: string[]; // UCI
  san: string[]; // same line in SAN
}

export interface PositionAnalysis {
  fen: string;
  lines: EngineLine[]; // best first; empty for terminal positions
  terminal?: 'checkmate' | 'draw';
}

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export interface GameMove {
  ply: number; // 1-based
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  before: string; // FEN
  after: string; // FEN
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  moves: GameMove[];
}

export interface MoveAnalysis extends GameMove {
  classification: Classification;
  winBefore: number; // win % for the mover before the move (0-100)
  winAfter: number; // win % for the mover after the move
  loss: number; // win % lost by this move
  accuracy: number; // 0-100
  bestUci: string | null;
  bestSan: string | null;
  bestLine: string[]; // SAN
  comment: string;
}

export interface GameAnalysis {
  game: ParsedGame;
  positions: PositionAnalysis[]; // positions.length === moves.length + 1
  moves: MoveAnalysis[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Record<Classification, number>>;
  opening: string | null;
  depth: number;
}
