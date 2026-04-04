/**
 * simulate-strip-popularity.mjs
 *
 * Run this ONCE to generate strip-freq.json.
 * Usage:
 *   node simulate-strip-popularity.mjs
 *
 * Output:
 *   strip-freq.json  — popularity weights for every (row, col, dir, length) strip
 *
 * How it works:
 *   1. Simulates N games at each totalTile size (9–15)
 *   2. For each game, records which strip was chosen by selectRealisticPlacement
 *   3. Counts frequency of each strip
 *   4. Normalises to weights and saves
 *
 * Requirements:
 *   - Node 18+ (ESM)
 *   - Your generator file at ./amath-bingo-generator-v5.js  (adjust path if needed)
 *   - Your placement file at ./crossBingoPlacement.js       (adjust path if needed)
 */

import { selectRealisticPlacement } from './crossBingoPlacement.js';
import { writeFileSync }            from 'fs';
import { generateBingo }            from './bingoGenerator.js';

// ── Config ────────────────────────────────────────────────────────────────────

let GAMES_PER_LENGTH = 1000000;   // samples per totalTile size — raise for more accuracy
const TILE_SIZES       = [9, 10, 11, 12, 13, 14, 15];

// ── Simulation ────────────────────────────────────────────────────────────────

const freq = {};   // key: "len:row:col:dir"  value: count

function key(len, row, col, dir) {
  return `${len}:${row}:${col}:${dir}`;
}

console.log('Starting simulation...');

for (const len of TILE_SIZES) {
  if (len == 9) {
    GAMES_PER_LENGTH = 100000000;
  } else {
    GAMES_PER_LENGTH = 10000000;
  }
  console.log(`  Simulating length=${len} (${GAMES_PER_LENGTH} samples)...`);
  let sampled = 0;

  while (sampled < GAMES_PER_LENGTH) {
    // selectRealisticPlacement is pure — just call it directly.
    // No need to go through generateBingo() for this phase.
    const placement = selectRealisticPlacement(len, true);
    const k = key(len, placement.rowIdx, placement.colStart, placement.dir);
    freq[k] = (freq[k] || 0) + 1;
    sampled++;
  }
}

// ── Normalise ─────────────────────────────────────────────────────────────────
// For each length, compute total samples and normalise to [0, 1].
// We store the RAW counts too so you can blend them with the heatmap later.

const byLength = {};

for (const [k, count] of Object.entries(freq)) {
  const [lenStr, rowStr, colStr, dir] = k.split(':');
  const len = parseInt(lenStr, 10);
  if (!byLength[len]) byLength[len] = { total: 0, strips: [] };
  byLength[len].total += count;
  byLength[len].strips.push({ row: parseInt(rowStr, 10), col: parseInt(colStr, 10), dir, count });
}

// Build the output structure
const output = {
  meta: {
    gamesPerLength: GAMES_PER_LENGTH,
    tileSizes:      TILE_SIZES,
    generatedAt:    new Date().toISOString(),
    note:           'Popularity weights derived from sampling selectRealisticPlacement(). Re-run to refresh.',
  },
  weights: {},
};

for (const [len, data] of Object.entries(byLength)) {
  const tileLen = parseInt(len, 10);
  const equalProb = 1 / tileLen;
  output.weights[len] = data.strips.map(s => ({
    row:       s.row,
    col:       s.col,
    dir:       s.dir,
    freq:      s.count,
    weight:    s.count / data.total,   // normalised probability
    slotProbs: Array(tileLen).fill(equalProb),  // equal prob per slot position
  }));

  // Sort descending by weight for readability
  output.weights[len].sort((a, b) => b.weight - a.weight);
}

// ── Save ──────────────────────────────────────────────────────────────────────

writeFileSync('strip-freq.json', JSON.stringify(output, null, 2), 'utf8');

console.log('\nDone. Output: strip-freq.json');
console.log('Top 5 strips per length:');
for (const len of TILE_SIZES) {
  const top = output.weights[len].slice(0, 5);
  console.log(`  len=${len}: ` + top.map(s => `(r${s.row},c${s.col},${s.dir}) ${(s.weight * 100).toFixed(1)}%`).join('  '));
}
