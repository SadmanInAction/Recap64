// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

// Thin promise-based wrapper around Stockfish running in a Web Worker (UCI protocol).

/** Score from the perspective of the side to move, as reported by UCI. */
export type UciScore = { type: 'cp' | 'mate'; value: number };

export interface UciLine {
  multipv: number;
  depth: number;
  score: UciScore;
  pv: string[]; // moves in UCI notation, e.g. "e2e4", "e7e8q"
}

export interface SearchResult {
  bestmove: string | null;
  lines: UciLine[]; // sorted by multipv (best first)
}

export interface SearchOptions {
  depth?: number;
  /** Time cap in ms (combined with depth: whichever is reached first). */
  movetime?: number;
  multiPv?: number;
  /** Called whenever a new complete set of lines is available (for live display). */
  onInfo?: (lines: UciLine[]) => void;
  /** Checked right before the search starts; if true the search is skipped. */
  isCancelled?: () => boolean;
}

type Listener = (line: string) => void;

export class Engine {
  private worker!: Worker;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private currentMultiPv = 1;
  private searching = false;
  private _threads = 1;
  readonly ready: Promise<void>;

  constructor(maxThreads = 8) {
    // The multi-threaded build needs SharedArrayBuffer, i.e. a cross-origin isolated page.
    const threaded = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
    const threads = Math.max(1, Math.min(maxThreads, (navigator.hardwareConcurrency || 2) - 1));

    this.ready = (async () => {
      if (threaded && threads > 1 && (await this.boot('stockfish-mt.js'))) {
        this._threads = threads;
        this.send(`setoption name Threads value ${threads}`);
        this.send('setoption name Hash value 64');
      } else if (await this.boot('stockfish.js')) {
        this._threads = 1;
        this.send('setoption name Hash value 32');
      } else {
        throw new Error('Could not start the Stockfish engine.');
      }
      await this.isReady();
    })();
  }

  /** Number of search threads in use (resolved once `ready` settles). */
  get threads() {
    return this._threads;
  }

  /** Starts a worker and completes the UCI handshake; false if it fails to load. */
  private boot(file: string): Promise<boolean> {
    this.worker?.terminate();
    this.worker = new Worker(`${import.meta.env.BASE_URL}stockfish/${file}`);
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data);
      for (const line of text.split('\n')) {
        if (line) this.listeners.forEach((l) => l(line));
      }
    };
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 15000);
      this.worker.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      this.waitFor((l) => l === 'uciok').then(() => {
        clearTimeout(timer);
        resolve(true);
      });
      this.send('uci');
    });
  }

  send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const l: Listener = (line) => {
        if (pred(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
    });
  }

  private async isReady() {
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  /** Clears the hash table; call before analysing an unrelated game. */
  newGame() {
    return this.enqueue(async () => {
      this.send('ucinewgame');
      await this.isReady();
    });
  }

  /** Interrupts the running search (it will still resolve with what it found so far). */
  stop() {
    if (this.searching) this.send('stop');
  }

  analyze(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    return this.enqueue(() => this.search(fen, opts));
  }

  terminate() {
    this.worker.terminate();
    this.listeners.clear();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.ready).then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async search(fen: string, opts: SearchOptions): Promise<SearchResult> {
    if (opts.isCancelled?.()) return { bestmove: null, lines: [] };

    const multiPv = opts.multiPv ?? 1;
    if (multiPv !== this.currentMultiPv) {
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.currentMultiPv = multiPv;
    }

    const lines = new Map<number, UciLine>();
    let lastDepth = 0;

    const onLine: Listener = (line) => {
      if (!line.startsWith('info ') || !line.includes(' pv ')) return;
      if (line.includes(' lowerbound') || line.includes(' upperbound')) return;
      const parsed = parseInfo(line);
      if (!parsed) return;
      if (parsed.depth > lastDepth && parsed.multipv === 1) lastDepth = parsed.depth;
      lines.set(parsed.multipv, parsed);
      if (opts.onInfo && parsed.multipv === Math.min(multiPv, lines.size)) {
        opts.onInfo(sortedLines(lines));
      }
    };
    this.listeners.add(onLine);

    this.searching = true;
    this.send(`position fen ${fen}`);
    // With both limits set, Stockfish stops at whichever is reached first.
    const limits = [opts.depth && `depth ${opts.depth}`, opts.movetime && `movetime ${opts.movetime}`].filter(Boolean);
    this.send(`go ${limits.length ? limits.join(' ') : 'depth 16'}`);
    const done = await this.waitFor((l) => l.startsWith('bestmove'));
    this.searching = false;
    this.listeners.delete(onLine);

    const best = done.split(' ')[1];
    return {
      bestmove: best && best !== '(none)' ? best : null,
      lines: sortedLines(lines),
    };
  }
}

function sortedLines(map: Map<number, UciLine>): UciLine[] {
  return [...map.values()].sort((a, b) => a.multipv - b.multipv);
}

function parseInfo(line: string): UciLine | null {
  const tokens = line.split(' ');
  let depth = 0;
  let multipv = 1;
  let score: UciScore | null = null;
  let pv: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = Number(tokens[++i]);
        break;
      case 'multipv':
        multipv = Number(tokens[++i]);
        break;
      case 'score':
        score = { type: tokens[i + 1] as 'cp' | 'mate', value: Number(tokens[i + 2]) };
        i += 2;
        break;
      case 'pv':
        pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }
  if (!score || pv.length === 0) return null;
  return { depth, multipv, score, pv };
}
