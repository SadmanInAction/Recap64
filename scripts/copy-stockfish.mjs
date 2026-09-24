// Copies the lite Stockfish WASM builds into public/ so they can run in a Web Worker.
//  - stockfish.js     single-threaded, works everywhere
//  - stockfish-mt.js  multi-threaded, needs cross-origin isolation (COOP/COEP headers, see vite.config.ts)
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'stockfish');

if (!existsSync(src)) {
  console.warn('[copy-stockfish] stockfish package not found, skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
const files = {
  'stockfish-19-lite-single.js': 'stockfish.js',
  'stockfish-19-lite-single.wasm': 'stockfish.wasm',
  'stockfish-19-lite.js': 'stockfish-mt.js',
  'stockfish-19-lite.wasm': 'stockfish-mt.wasm',
};
for (const [from, to] of Object.entries(files)) copyFileSync(join(src, from), join(dest, to));
// The engine is GPLv3: ship its licence next to the binaries.
copyFileSync(join(src, '..', 'Copying.txt'), join(dest, 'COPYING.txt'));
console.log('[copy-stockfish] Stockfish 19 lite builds copied to public/stockfish');
