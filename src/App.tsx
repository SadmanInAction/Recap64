import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Arrow } from 'react-chessboard';
import { analyzeGame, parsePgn, terminalState } from './analysis/analyze';
import { CLASS_INFO, uciToMove } from './analysis/classify';
import { formatScore } from './analysis/score';
import type { GameAnalysis, ParsedGame, PositionAnalysis, Score } from './analysis/types';
import { Engine } from './engine/Engine';
import { useLiveEngine } from './engine/useLiveEngine';
import { BoardView } from './components/BoardView';
import { ClassIcon } from './components/ClassIcon';
import { EvalGraph } from './components/EvalGraph';
import { DEPTHS, ImportPanel } from './components/ImportPanel';
import {
  deleteAnalysis,
  gameId,
  getAnalysis,
  listAnalyses,
  localStorageGet,
  localStorageSet,
  saveAnalysis,
  type SavedSummary,
} from './lib/storage';
import { MoveList } from './components/MoveList';
import { Summary } from './components/Summary';
import { clockAt, formatClock, formatSpent, formatTimeControl } from './lib/time';

type Screen = 'import' | 'analyzing' | 'review';

/** The open game lives in the URL hash (#game=<id>&ply=<n>) so a reload restores it. */
function readHash(): { id: string | null; ply: number } {
  const params = new URLSearchParams(location.hash.slice(1));
  return { id: params.get('game'), ply: Number(params.get('ply')) || 0 };
}

interface Variation {
  basePly: number;
  moves: { san: string; uci: string; from: string; to: string; fen: string }[];
  index: number; // 0 = base position
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('import');
  const [depth, setDepth] = useState(() => Number(localStorageGet('ca.depth')) || 16);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; positions: PositionAnalysis[] }>({
    done: 0,
    total: 0,
    positions: [],
  });
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [variation, setVariation] = useState<Variation | null>(null);
  const [panel, setPanel] = useState<'summary' | 'moves'>('summary');
  const [liveOn, setLiveOn] = useState(() => localStorageGet('ca.live') !== 'off');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  // While restoring a game from the URL on first load, render nothing instead of flashing the home screen.
  const [booting, setBooting] = useState(() => !!readHash().id);

  const engineRef = useRef<Engine | null>(null);
  const runRef = useRef(0);

  const openReview = useCallback((result: GameAnalysis, id: string, atPly = 0, push = true) => {
    setGame(result.game);
    setAnalysis(result);
    setCurrentId(id);
    setVariation(null);
    setPly(Math.max(0, Math.min(result.moves.length, atPly)));
    setPanel(atPly > 0 ? 'moves' : 'summary');
    setOrientation(guessOrientation(result.game));
    setError(null);
    setScreen('review');
    const url = `#game=${id}&ply=${atPly}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }, []);

  const goHome = useCallback((push: boolean) => {
    runRef.current++;
    engineRef.current?.stop();
    setScreen('import');
    setAnalysis(null);
    setGame(null);
    setVariation(null);
    setCurrentId(null);
    if (push) history.pushState(null, '', location.pathname + location.search);
  }, []);

  // Sync the screen with the URL on first load and on browser back/forward.
  useEffect(() => {
    const route = async () => {
      const { id, ply: atPly } = readHash();
      if (!id) {
        goHome(false);
      } else {
        const stored = await getAnalysis(id);
        if (stored) openReview(stored, id, atPly, false);
        else {
          history.replaceState(null, '', location.pathname + location.search);
          goHome(false);
        }
      }
      setBooting(false);
    };
    route();
    window.addEventListener('popstate', route);
    return () => window.removeEventListener('popstate', route);
  }, [openReview, goHome]);

  // Keep the current move in the URL (replace, so stepping through moves doesn't flood history).
  useEffect(() => {
    if (screen === 'review' && currentId) history.replaceState(null, '', `#game=${currentId}&ply=${ply}`);
  }, [screen, currentId, ply]);

  useEffect(() => {
    if (screen === 'import') listAnalyses().then(setSaved);
  }, [screen]);

  const openSaved = async (id: string) => {
    const stored = await getAnalysis(id);
    if (stored) openReview(stored, id);
    else setSaved(await listAnalyses());
  };

  const removeSaved = async (id: string) => {
    await deleteAnalysis(id);
    setSaved(await listAnalyses());
  };

  const startAnalysis = async (pgn: string) => {
    let parsed: ParsedGame;
    try {
      parsed = parsePgn(pgn);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const id = gameId(parsed);

    // Already analysed at least this deeply? Open the saved result instantly.
    const stored = await getAnalysis(id);
    if (stored && stored.depth >= depth) {
      openReview(stored, id);
      return;
    }

    setError(null);
    setGame(parsed);
    setAnalysis(null);
    setVariation(null);
    setPly(0);
    setPanel('summary');
    setOrientation(guessOrientation(parsed));
    setProgress({ done: 0, total: parsed.moves.length + 1, positions: [] });
    setScreen('analyzing');

    const run = ++runRef.current;
    engineRef.current ??= new Engine();
    try {
      const result = await analyzeGame(engineRef.current, parsed, {
        depth,
        movetime: DEPTHS.find((d) => d.value === depth)?.movetime,
        isCancelled: () => run !== runRef.current,
        onProgress: (done, total, positions) => setProgress({ done, total, positions: [...positions] }),
      });
      if (!result || run !== runRef.current) return;
      openReview(result, id);
      saveAnalysis(result);
    } catch (e) {
      setError(`Analysis failed: ${(e as Error).message}`);
      setScreen('import');
    }
  };

  const reset = () => goHome(screen !== 'import');

  const changeDepth = (d: number) => {
    setDepth(d);
    localStorageSet('ca.depth', String(d));
  };

  // ----- current position -----
  const maxPly = analysis?.moves.length ?? 0;
  const baseFen = analysis ? analysis.positions[variation ? variation.basePly : ply].fen : new Chess().fen();
  const fen = variation && variation.index > 0 ? variation.moves[variation.index - 1].fen : baseFen;
  const currentMove = !variation && analysis && ply > 0 ? analysis.moves[ply - 1] : null;

  const liveLines = useLiveEngine(fen, screen === 'review' && liveOn);

  const score: Score | undefined = useMemo(() => {
    const terminal = terminalState(fen);
    if (terminal === 'checkmate') {
      const loser = fen.split(' ')[1] as 'w' | 'b';
      return { kind: 'mate', moves: 0, winner: loser === 'w' ? 'b' : 'w' };
    }
    if (terminal === 'draw') return { kind: 'cp', cp: 0 };
    if (liveLines[0] && (variation || liveLines[0].depth >= (analysis?.depth ?? 99))) return liveLines[0].score;
    if (!variation && analysis) return analysis.positions[ply].lines[0]?.score;
    return liveLines[0]?.score;
  }, [fen, liveLines, variation, analysis, ply]);

  const arrows: Arrow[] = useMemo(() => {
    const list: Arrow[] = [];
    if (currentMove && currentMove.bestUci && currentMove.bestUci !== currentMove.uci && currentMove.classification !== 'book') {
      const m = uciToMove(currentMove.bestUci);
      list.push({ startSquare: m.from, endSquare: m.to, color: 'rgba(129, 182, 76, 0.85)' });
    }
    if (variation && liveLines[0]?.pv[0]) {
      const m = uciToMove(liveLines[0].pv[0]);
      list.push({ startSquare: m.from, endSquare: m.to, color: 'rgba(92, 139, 176, 0.85)' });
    }
    return list;
  }, [currentMove, variation, liveLines]);

  const lastMove = variation
    ? variation.index > 0
      ? variation.moves[variation.index - 1]
      : variation.basePly > 0
        ? analysis!.moves[variation.basePly - 1]
        : undefined
    : currentMove ?? undefined;

  // ----- navigation -----
  const goTo = useCallback(
    (p: number) => {
      setVariation(null);
      setPly(Math.max(0, Math.min(maxPly, p)));
    },
    [maxPly],
  );

  const step = useCallback(
    (delta: number) => {
      if (variation) {
        const next = variation.index + delta;
        if (next < 0) return goTo(variation.basePly);
        if (next > variation.moves.length) return;
        setVariation({ ...variation, index: next });
        return;
      }
      goTo(ply + delta);
    },
    [variation, ply, goTo],
  );

  useEffect(() => {
    if (screen !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowUp' || e.key === 'Home') goTo(0);
      else if (e.key === 'ArrowDown' || e.key === 'End') goTo(maxPly);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else if (e.key === 'Escape' && variation) goTo(variation.basePly);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, step, goTo, maxPly, variation]);

  // ----- trying your own moves -----
  const onDrop = (from: string, to: string): boolean => {
    if (!analysis) return false;
    const chess = new Chess(fen);
    let move;
    try {
      move = chess.move({ from, to, promotion: 'q' });
    } catch {
      return false;
    }
    const uci = move.from + move.to + (move.promotion ?? '');

    // Played the actual game move: just advance along the game.
    if (!variation && analysis.moves[ply]?.uci === uci) {
      setPly(ply + 1);
      return true;
    }
    const entry = { san: move.san, uci, from: move.from, to: move.to, fen: move.after };
    if (!variation) {
      setVariation({ basePly: ply, moves: [entry], index: 1 });
    } else {
      const moves = [...variation.moves.slice(0, variation.index), entry];
      setVariation({ ...variation, moves, index: moves.length });
    }
    setPanel('moves');
    return true;
  };

  const toggleLive = () => {
    setLiveOn((v) => {
      localStorageSet('ca.live', v ? 'off' : 'on');
      return !v;
    });
  };

  const headers = game?.headers ?? {};
  const topColor = orientation === 'white' ? 'b' : 'w';
  // Clocks follow the game position (the variation's starting point while exploring).
  const clockPly =
    screen === 'analyzing' ? Math.max(0, progress.positions.length - 1) : variation ? variation.basePly : ply;
  const running = game && clockPly < game.moves.length ? game.moves[clockPly].color : null;
  const player = (c: 'w' | 'b') => ({
    name: (c === 'w' ? headers.White : headers.Black) || (c === 'w' ? 'White' : 'Black'),
    elo: c === 'w' ? headers.WhiteElo : headers.BlackElo,
    acc: analysis?.accuracy[c],
    color: c,
    clock: game ? clockAt(game, clockPly, c) : undefined,
    active: running === c,
    lowTime: game?.timeControl ? Math.max(20, game.timeControl.base * 0.1) : 20,
  });

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={reset}>
          <span className="logo">♞</span> Recap64
        </button>
        {screen !== 'import' && (
          <button className="btn-secondary" onClick={reset}>
            + New game
          </button>
        )}
      </header>

      {screen === 'import' && !booting && (
        <ImportPanel
          depth={depth}
          onDepthChange={changeDepth}
          onAnalyze={startAnalysis}
          error={error}
          saved={saved}
          onOpenSaved={openSaved}
          onDeleteSaved={removeSaved}
        />
      )}

      {screen !== 'import' && game && (
        <main className="review">
          <section className="board-col">
            <PlayerBar {...player(topColor)} />
            <BoardView
              fen={screen === 'analyzing' ? (progress.positions.at(-1)?.fen ?? game.startFen) : fen}
              orientation={orientation}
              lastMove={
                lastMove
                  ? { from: lastMove.from, to: lastMove.to, classification: 'classification' in lastMove ? lastMove.classification : undefined }
                  : undefined
              }
              arrows={arrows}
              score={screen === 'review' ? score : undefined}
              onDrop={onDrop}
            />
            <PlayerBar {...player(topColor === 'w' ? 'b' : 'w')} />
            <div className="controls">
              <button onClick={() => goTo(0)} title="Start (↑)" disabled={screen !== 'review'}>⏮</button>
              <button onClick={() => step(-1)} title="Back (←)" disabled={screen !== 'review'}>◀</button>
              <button onClick={() => step(1)} title="Forward (→)" disabled={screen !== 'review'}>▶</button>
              <button onClick={() => goTo(maxPly)} title="End (↓)" disabled={screen !== 'review'}>⏭</button>
              <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip board (F)">⇅</button>
            </div>
          </section>

          <aside className="side">
            {screen === 'analyzing' && (
              <div className="card analyzing">
                <h2>Analyzing game…</h2>
                <p className="muted">
                  Stockfish 19 · {engineRef.current?.threads ?? 1} thread{engineRef.current?.threads === 1 ? '' : 's'} ·{' '}
                  {DEPTHS.find((d) => d.value === depth)?.label ?? ''} (depth {depth}) · position {progress.done} of{' '}
                  {progress.total}
                </p>
                <div className="progress">
                  <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                </div>
                <EvalGraph positions={progress.positions} total={progress.total} />
              </div>
            )}

            {screen === 'review' && analysis && (
              <div className="card review-card">
                <div className="tabs">
                  <button className={`tab ${panel === 'summary' ? 'active' : ''}`} onClick={() => setPanel('summary')}>
                    Summary
                  </button>
                  <button className={`tab ${panel === 'moves' ? 'active' : ''}`} onClick={() => setPanel('moves')}>
                    Moves
                  </button>
                </div>

                {panel === 'summary' ? (
                  <>
                    {(analysis.opening || analysis.game.timeControl) && (
                      <p className="opening">
                        {analysis.opening && <>📖 {analysis.opening}</>}
                        {analysis.opening && analysis.game.timeControl && ' · '}
                        {analysis.game.timeControl && <>⏱ {formatTimeControl(analysis.game.timeControl)}</>}
                      </p>
                    )}
                    <EvalGraph positions={analysis.positions} moves={analysis.moves} current={variation ? variation.basePly : ply} onSelect={goTo} />
                    <Summary analysis={analysis} />
                    <button
                      className="btn-primary wide"
                      onClick={() => {
                        setPanel('moves');
                        if (ply === 0) goTo(1);
                      }}
                    >
                      Start review
                    </button>
                  </>
                ) : (
                  <>
                    <CoachBox analysis={analysis} ply={ply} variation={variation} onExitVariation={() => variation && goTo(variation.basePly)} />
                    <EvalGraph positions={analysis.positions} moves={analysis.moves} current={variation ? variation.basePly : ply} onSelect={goTo} />
                    <EngineLines lines={liveLines} on={liveOn} onToggle={toggleLive} fen={fen} />
                    <MoveList moves={analysis.moves} current={variation ? -1 : ply} onSelect={goTo} />
                  </>
                )}
              </div>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}

/** Labels each SAN move with its move number, e.g. ["1. e4", "e5"] or ["3... Nf6", "4. d4"]. */
function numberedSan(fen: string, sans: string[]): string[] {
  const moveNo = Number(fen.split(' ')[5]);
  const whiteFirst = fen.split(' ')[1] === 'w';
  return sans.map((s, i) => {
    const isWhite = whiteFirst ? i % 2 === 0 : i % 2 === 1;
    const n = moveNo + Math.floor((i + (whiteFirst ? 0 : 1)) / 2);
    if (i === 0 && !whiteFirst) return `${moveNo}... ${s}`;
    return isWhite ? `${n}. ${s}` : s;
  });
}

function guessOrientation(game: ParsedGame): 'white' | 'black' {
  // If we fetched this user's games, show the board from their side.
  const user = (localStorageGet('ca.user.chess.com') ?? '').toLowerCase();
  const user2 = (localStorageGet('ca.user.lichess') ?? '').toLowerCase();
  const black = (game.headers.Black ?? '').toLowerCase();
  return black && (black === user || black === user2) ? 'black' : 'white';
}

function PlayerBar({
  name,
  elo,
  acc,
  color,
  clock,
  active,
  lowTime,
}: {
  name: string;
  elo?: string;
  acc?: number;
  color: 'w' | 'b';
  clock?: number;
  active: boolean;
  lowTime: number;
}) {
  return (
    <div className="player-bar">
      <span className={`avatar ${color === 'w' ? 'white' : 'black'}`}>{color === 'w' ? '♔' : '♚'}</span>
      <span className="player-name">{name}</span>
      {elo && elo !== '?' && <span className="player-elo">({elo})</span>}
      <span className="player-right">
        {acc !== undefined && <span className="player-acc">{acc.toFixed(1)}%</span>}
        {clock !== undefined && (
          <span className={`clock ${active ? 'active' : ''} ${clock < lowTime ? 'low' : ''}`}>{formatClock(clock)}</span>
        )}
      </span>
    </div>
  );
}

function CoachBox({
  analysis,
  ply,
  variation,
  onExitVariation,
}: {
  analysis: GameAnalysis;
  ply: number;
  variation: Variation | null;
  onExitVariation: () => void;
}) {
  if (variation) {
    return (
      <div className="coach">
        <div className="coach-head">
          <span className="coach-title">Exploring your own moves</span>
          <button className="btn-secondary small" onClick={onExitVariation}>
            Back to game
          </button>
        </div>
        <p className="variation-line">
          {numberedSan(
            analysis.positions[variation.basePly].fen,
            variation.moves.map((m) => m.san),
          ).map((label, i) => (
            <span key={i} className={i === variation.index - 1 ? 'hl' : ''}>
              {label}{' '}
            </span>
          ))}
        </p>
      </div>
    );
  }
  if (ply === 0) {
    return (
      <div className="coach">
        <p className="coach-text">Starting position. Use → or click a move to step through the game. Drag pieces to try your own ideas.</p>
      </div>
    );
  }
  const m = analysis.moves[ply - 1];
  const info = CLASS_INFO[m.classification];
  const pos = analysis.positions[ply];
  const evalAfter = pos.terminal === 'checkmate' ? (m.color === 'w' ? '1-0' : '0-1') : pos.terminal === 'draw' ? '½-½' : formatScore(pos.lines[0]?.score);
  const showBest = m.bestSan && m.bestUci !== m.uci && m.classification !== 'book' && m.classification !== 'forced';

  return (
    <div className="coach" style={{ borderColor: info.color }}>
      <div className="coach-head">
        <ClassIcon type={m.classification} size={28} />
        <span className="coach-title" style={{ color: info.color }}>
          {Math.ceil(m.ply / 2)}
          {m.color === 'w' ? '.' : '...'} {m.san} · {info.label}
        </span>
        <span className="coach-eval">{evalAfter}</span>
      </div>
      <p className="coach-text">{m.comment}</p>
      {m.timeSpent !== undefined && (
        <p className="coach-time">
          ⏱ {formatSpent(m.timeSpent)} spent{m.clock !== undefined && <> · {formatClock(m.clock)} left</>}
        </p>
      )}
      {showBest && m.bestLine.length > 0 && (
        <p className="best-line">
          <span className="muted">Best line: </span>
          {numberedSan(m.before, m.bestLine.slice(0, 8)).join(' ')}
        </p>
      )}
    </div>
  );
}

function EngineLines({
  lines,
  on,
  onToggle,
  fen,
}: {
  lines: { score: Score; depth: number; san: string[] }[];
  on: boolean;
  onToggle: () => void;
  fen: string;
}) {
  const formatLine = (san: string[]) => numberedSan(fen, san.slice(0, 10)).join(' ');

  return (
    <div className="engine-lines">
      <div className="engine-head">
        <label className="switch">
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span />
        </label>
        <span>Live engine</span>
        {on && lines[0] && <span className="muted">depth {lines[0].depth}</span>}
      </div>
      {on &&
        lines.map((l, i) => (
          <div className="engine-line" key={i}>
            <span className={`line-score ${l.score.kind === 'mate' ? (l.score.winner === 'w' ? 'pos' : 'neg') : l.score.cp >= 0 ? 'pos' : 'neg'}`}>
              {formatScore(l.score)}
            </span>
            <span className="line-moves">{formatLine(l.san)}</span>
          </div>
        ))}
    </div>
  );
}
