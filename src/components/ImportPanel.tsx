import { useState } from 'react';
import { fetchChessComGames, fetchLichessGames, type GameSummary } from '../lib/importGames';

type Tab = 'pgn' | 'chess.com' | 'lichess';

export const DEPTHS = [
  { value: 12, label: 'Fast', hint: 'depth 12', movetime: 1000 },
  { value: 16, label: 'Standard', hint: 'depth 16', movetime: 3000 },
  { value: 20, label: 'Deep', hint: 'depth 20 · slower', movetime: 8000 },
];

interface Props {
  depth: number;
  onDepthChange: (d: number) => void;
  onAnalyze: (pgn: string) => void;
  error?: string | null;
}

const SAMPLE_PGN = `[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export function ImportPanel({ depth, onDepthChange, onAnalyze, error }: Props) {
  const [tab, setTab] = useState<Tab>(() => (localStorageGet('ca.tab') as Tab) || 'pgn');
  const [pgn, setPgn] = useState('');
  const [username, setUsername] = useState(() => localStorageGet(`ca.user.${tab}`) ?? '');
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const switchTab = (t: Tab) => {
    setTab(t);
    setGames(null);
    setFetchError(null);
    setUsername(localStorageGet(`ca.user.${t}`) ?? '');
    localStorageSet('ca.tab', t);
  };

  const loadGames = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setFetchError(null);
    setGames(null);
    try {
      const list = tab === 'chess.com' ? await fetchChessComGames(username) : await fetchLichessGames(username);
      setGames(list);
      localStorageSet(`ca.user.${tab}`, username.trim());
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const me = username.trim().toLowerCase();

  return (
    <div className="import">
      <div className="import-hero">
        <h1>Game Review</h1>
        <p>Free, unlimited game analysis with Stockfish 19. It runs in your browser, so your games never leave your computer.</p>
      </div>

      <div className="card">
        <div className="tabs">
          {(['pgn', 'chess.com', 'lichess'] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
              {t === 'pgn' ? 'Paste PGN' : t === 'chess.com' ? 'Chess.com' : 'Lichess'}
            </button>
          ))}
        </div>

        {tab === 'pgn' ? (
          <div className="pgn-input">
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder="Paste a PGN here… (Chess.com: Share → PGN → Copy)"
              spellCheck={false}
            />
            <div className="row">
              <button className="btn-link" onClick={() => setPgn(SAMPLE_PGN)}>
                Load sample game
              </button>
              <button className="btn-primary" disabled={!pgn.trim()} onClick={() => onAnalyze(pgn)}>
                Analyze game
              </button>
            </div>
          </div>
        ) : (
          <div>
            <form className="user-form" onSubmit={loadGames}>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={`${tab === 'chess.com' ? 'Chess.com' : 'Lichess'} username`}
                autoFocus
              />
              <button className="btn-primary" disabled={loading || !username.trim()}>
                {loading ? 'Loading…' : 'Fetch games'}
              </button>
            </form>
            {fetchError && <p className="error">{fetchError}</p>}
            {games && games.length === 0 && <p className="muted">No standard games found.</p>}
            {games && games.length > 0 && (
              <div className="game-list">
                {games.map((g) => {
                  const userIsWhite = g.white.toLowerCase() === me;
                  const userIsBlack = g.black.toLowerCase() === me;
                  const outcome =
                    g.result === '½-½'
                      ? 'draw'
                      : (g.result === '1-0' && userIsWhite) || (g.result === '0-1' && userIsBlack)
                        ? 'win'
                        : userIsWhite || userIsBlack
                          ? 'loss'
                          : '';
                  return (
                    <button key={g.id} className="game-item" onClick={() => onAnalyze(g.pgn)}>
                      <span className={`result-dot ${outcome}`}>{g.result}</span>
                      <span className="game-players">
                        <span>
                          <i className="piece-dot white" /> {g.white} {g.whiteRating && <em>({g.whiteRating})</em>}
                        </span>
                        <span>
                          <i className="piece-dot black" /> {g.black} {g.blackRating && <em>({g.blackRating})</em>}
                        </span>
                      </span>
                      <span className="game-meta">
                        <span className="time-class">{g.timeClass}</span>
                        <span>{g.date.toLocaleDateString()}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="depth-select">
          <span>Analysis strength</span>
          <div className="segmented">
            {DEPTHS.map((d) => (
              <button
                key={d.value}
                className={depth === d.value ? 'active' : ''}
                onClick={() => onDepthChange(d.value)}
                title={d.hint}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
