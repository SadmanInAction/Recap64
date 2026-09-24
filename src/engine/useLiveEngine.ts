// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

import { useEffect, useRef, useState } from 'react';
import { toEngineLines, terminalState } from '../analysis/analyze';
import type { EngineLine } from '../analysis/types';
import { Engine } from './Engine';

/** Continuously analyses `fen` with MultiPV and streams the lines as they deepen. */
export function useLiveEngine(fen: string, enabled: boolean, depth = 20, multiPv = 3) {
  const engineRef = useRef<Engine | null>(null);
  const genRef = useRef(0);
  const [result, setResult] = useState<{ fen: string; lines: EngineLine[] }>({ fen: '', lines: [] });

  useEffect(() => {
    return () => engineRef.current?.terminate();
  }, []);

  useEffect(() => {
    const gen = ++genRef.current;
    engineRef.current?.stop();
    if (!enabled || terminalState(fen)) return;

    engineRef.current ??= new Engine();
    const engine = engineRef.current;
    const cancelled = () => gen !== genRef.current;
    engine
      .analyze(fen, {
        depth,
        multiPv,
        isCancelled: cancelled,
        onInfo: (lines) => {
          if (!cancelled()) setResult({ fen, lines: toEngineLines(fen, lines) });
        },
      })
      .catch(() => undefined);
  }, [fen, enabled, depth, multiPv]);

  return result.fen === fen ? result.lines : [];
}
