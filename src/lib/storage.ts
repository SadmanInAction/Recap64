// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

// Browser persistence: finished analyses in IndexedDB, small preferences in localStorage.
// Everything is best-effort — if storage is unavailable (private mode, blocked site data)
// the app keeps working, it just doesn't remember anything.

import type { GameAnalysis, ParsedGame } from '../analysis/types';

const DB_NAME = 'recap64';
const DB_VERSION = 1;
const ANALYSES = 'analyses'; // id -> { id, analysis }
const SUMMARIES = 'summaries'; // id -> SavedSummary (small, for the list)
const MAX_SAVED = 100;
/** Bump when the GameAnalysis shape changes so stale records are ignored. */
const SCHEMA = 1;

export interface SavedSummary {
  id: string;
  schema: number;
  savedAt: number;
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  date?: string;
  opening: string | null;
  accuracy: { w: number; b: number };
  depth: number;
  plies: number;
}

/** Stable id for a game: hash of its start position and move sequence. */
export function gameId(game: ParsedGame): string {
  return cyrb53(game.startFen + '|' + game.moves.map((m) => m.uci).join(' '));
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ANALYSES)) db.createObjectStore(ANALYSES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAnalysis(analysis: GameAnalysis): Promise<string | null> {
  const id = gameId(analysis.game);
  try {
    const db = await openDb();
    if (!db) return null;
    const h = analysis.game.headers;
    const summary: SavedSummary = {
      id,
      schema: SCHEMA,
      savedAt: Date.now(),
      white: h.White || 'White',
      black: h.Black || 'Black',
      whiteElo: h.WhiteElo,
      blackElo: h.BlackElo,
      result: h.Result || '*',
      date: h.Date,
      opening: analysis.opening,
      accuracy: analysis.accuracy,
      depth: analysis.depth,
      plies: analysis.moves.length,
    };
    const tx = db.transaction([ANALYSES, SUMMARIES], 'readwrite');
    tx.objectStore(ANALYSES).put({ id, analysis });
    tx.objectStore(SUMMARIES).put(summary);
    await done(tx);
    await prune(db);
    return id;
  } catch {
    return null;
  }
}

export async function getAnalysis(id: string): Promise<GameAnalysis | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const tx = db.transaction([ANALYSES, SUMMARIES], 'readonly');
    const [record, summary] = await Promise.all([
      request(tx.objectStore(ANALYSES).get(id)) as Promise<{ analysis: GameAnalysis } | undefined>,
      request(tx.objectStore(SUMMARIES).get(id)) as Promise<SavedSummary | undefined>,
    ]);
    if (!record || summary?.schema !== SCHEMA) return null;
    return record.analysis;
  } catch {
    return null;
  }
}

export async function listAnalyses(): Promise<SavedSummary[]> {
  try {
    const db = await openDb();
    if (!db) return [];
    const all = (await request(db.transaction(SUMMARIES, 'readonly').objectStore(SUMMARIES).getAll())) as SavedSummary[];
    return all.filter((s) => s.schema === SCHEMA).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function deleteAnalysis(id: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction([ANALYSES, SUMMARIES], 'readwrite');
    tx.objectStore(ANALYSES).delete(id);
    tx.objectStore(SUMMARIES).delete(id);
    await done(tx);
  } catch {
    /* ignore */
  }
}

/** Keeps only the most recent MAX_SAVED analyses. */
async function prune(db: IDBDatabase) {
  const all = (await request(db.transaction(SUMMARIES, 'readonly').objectStore(SUMMARIES).getAll())) as SavedSummary[];
  if (all.length <= MAX_SAVED) return;
  const old = all.sort((a, b) => b.savedAt - a.savedAt).slice(MAX_SAVED);
  const tx = db.transaction([ANALYSES, SUMMARIES], 'readwrite');
  for (const s of old) {
    tx.objectStore(ANALYSES).delete(s.id);
    tx.objectStore(SUMMARIES).delete(s.id);
  }
  await done(tx);
}

/** Small, fast, non-cryptographic string hash (cyrb53) → 14 hex chars. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
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
