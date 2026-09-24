// Builds public/openings.json (position EPD -> "ECO Opening name") from the
// open-source lichess-org/chess-openings dataset (CC0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const map = {};

for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${base}${file}.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch ${file}.tsv: ${res.status}`);
  const rows = (await res.text()).trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    map[epd] = `${eco} ${name}`;
  }
}

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'openings.json'), JSON.stringify(map));
console.log(`[openings] wrote ${Object.keys(map).length} positions`);
