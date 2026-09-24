// Fetches recent games from the public Chess.com and Lichess APIs (no login needed).

export interface GameSummary {
  id: string;
  source: 'chess.com' | 'lichess';
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string; // "1-0", "0-1", "½-½"
  timeClass: string;
  date: Date;
  pgn: string;
  url?: string;
}

export async function fetchChessComGames(username: string, limit = 40): Promise<GameSummary[]> {
  const user = encodeURIComponent(username.trim().toLowerCase());
  const res = await fetch(`https://api.chess.com/pub/player/${user}/games/archives`);
  if (res.status === 404) throw new Error(`Chess.com user "${username}" not found.`);
  if (!res.ok) throw new Error(`Chess.com request failed (${res.status}).`);
  const { archives } = (await res.json()) as { archives: string[] };

  const games: GameSummary[] = [];
  // Walk back month by month until we have enough games.
  for (let i = archives.length - 1; i >= 0 && games.length < limit; i--) {
    const r = await fetch(archives[i]);
    if (!r.ok) break;
    const data = (await r.json()) as { games: ChessComGame[] };
    const month = data.games
      .filter((g) => g.rules === 'chess' && g.pgn)
      .reverse()
      .map(
        (g): GameSummary => ({
          id: g.url,
          source: 'chess.com',
          white: g.white.username,
          black: g.black.username,
          whiteRating: g.white.rating,
          blackRating: g.black.rating,
          result: resultFromChessCom(g.white.result, g.black.result),
          timeClass: g.time_class,
          date: new Date(g.end_time * 1000),
          pgn: g.pgn,
          url: g.url,
        }),
      );
    games.push(...month);
  }
  return games.slice(0, limit);
}

interface ChessComGame {
  url: string;
  pgn: string;
  time_class: string;
  end_time: number;
  rules: string;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

function resultFromChessCom(w: string, b: string) {
  if (w === 'win') return '1-0';
  if (b === 'win') return '0-1';
  return '½-½';
}

export async function fetchLichessGames(username: string, limit = 40): Promise<GameSummary[]> {
  const user = encodeURIComponent(username.trim());
  const res = await fetch(
    `https://lichess.org/api/games/user/${user}?max=${limit}&pgnInJson=true&clocks=true&opening=true`,
    { headers: { Accept: 'application/x-ndjson' } },
  );
  if (res.status === 404) throw new Error(`Lichess user "${username}" not found.`);
  if (!res.ok) throw new Error(`Lichess request failed (${res.status}).`);
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LichessGame)
    .filter((g) => g.variant === 'standard' && g.pgn)
    .map((g) => ({
      id: g.id,
      source: 'lichess' as const,
      white: g.players.white.user?.name ?? (g.players.white.aiLevel ? `Stockfish lvl ${g.players.white.aiLevel}` : 'Anonymous'),
      black: g.players.black.user?.name ?? (g.players.black.aiLevel ? `Stockfish lvl ${g.players.black.aiLevel}` : 'Anonymous'),
      whiteRating: g.players.white.rating,
      blackRating: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
      timeClass: g.speed,
      date: new Date(g.createdAt),
      pgn: g.pgn,
      url: `https://lichess.org/${g.id}`,
    }));
}

interface LichessPlayer {
  user?: { name: string };
  rating?: number;
  aiLevel?: number;
}

interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  createdAt: number;
  winner?: 'white' | 'black';
  players: { white: LichessPlayer; black: LichessPlayer };
  pgn: string;
}
