// Recap64 - Copyright (C) 2026 Sadmanul Arefin
// SPDX-License-Identifier: GPL-3.0-or-later (with a GPLv3 section 7(b) attribution term, see NOTICE)

// Generates public/licenses.txt: the licence of every third-party package shipped to the browser,
// so the deployed site carries the notices that MIT / BSD / GPL require.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const sections = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue; // skip the root project and build-only tools
  const dir = join(root, path);
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  const text = file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : '(licence file not found)';
  const name = path.replace(/^.*node_modules\//, '');
  sections.push(`${name} ${info.version} — ${info.license ?? 'unknown'}\n${'-'.repeat(72)}\n${text}`);
}

const header = `Recap64 — third-party software notices
Recap64 - Copyright (C) 2026 Sadmanul Arefin
Licensed under the GNU GPL v3 or later with a section 7(b) attribution term (see NOTICE):
https://github.com/SadmanInAction/Recap64

Stockfish.js source code: https://github.com/nmrugg/stockfish.js
Stockfish source code:    https://github.com/official-stockfish/Stockfish
Opening names: lichess-org/chess-openings (CC0) — https://github.com/lichess-org/chess-openings
`;

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'licenses.txt'), [header, ...sections].join('\n\n' + '='.repeat(72) + '\n\n') + '\n');
console.log(`[notices] wrote licences for ${sections.length} packages`);
