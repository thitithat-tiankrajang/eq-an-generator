/**
 * analyze-patterns.mjs
 *
 * Input:
 *   strip-freq.json
 *
 * Output:
 *   pattern-freq.json
 *
 * Usage:
 *   node analyze-patterns.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { DESCRIPTION_BOARD } from './boardConstants.js';

// ── Load strip data ───────────────────────────────────────────────────────────

const stripData = JSON.parse(readFileSync('../../public/strip-freq.json', 'utf8'));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPattern(row, col, dir, length) {
  const pattern = [];

  for (let i = 0; i < length; i++) {
    const r = dir === 'V' ? row + i : row;
    const c = dir === 'H' ? col + i : col;

    pattern.push(DESCRIPTION_BOARD[r][c]);
  }

  return pattern;
}

function patternKey(pattern) {
  return pattern.join(',');
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    note: 'Aggregated bonus patterns from strip-freq.json',
  },
  patterns: {}
};

for (const [lenStr, strips] of Object.entries(stripData.weights)) {
  const len = parseInt(lenStr, 10);

  const map = new Map();
  let totalWeight = 0;

  for (const s of strips) {
    const pattern = getPattern(s.row, s.col, s.dir, len);
    const key = patternKey(pattern);

    const prev = map.get(key) || 0;
    map.set(key, prev + s.weight);

    totalWeight += s.weight;
  }

  // convert to array
  const arr = [];

  for (const [key, weight] of map.entries()) {
    arr.push({
      pattern: key.split(','),
      prob: weight / totalWeight
    });
  }

  // sort by probability
  arr.sort((a, b) => b.prob - a.prob);

  output.patterns[len] = arr;
}

// ── Save ──────────────────────────────────────────────────────────────────────

writeFileSync(
  './pattern-freq.json',
  JSON.stringify(output, null, 2),
  'utf8'
);

console.log('Done → pattern-freq.json');

// preview top 5
for (const len of Object.keys(output.patterns)) {
  console.log(`\nlen=${len}`);
  output.patterns[len].slice(0, 5).forEach(p => {
    console.log(
      `[${p.pattern.join(',')}] → ${(p.prob * 100).toFixed(2)}%`
    );
  });
}