/**
 * analyze-combos.mjs
 *
 * Output:
 *   combo-stats.json
 *
 * Usage:
 *   node analyze-combos.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { DESCRIPTION_BOARD } from './boardConstants.js';

// ── Load ──────────────────────────────────────────────────────────────────────

const data = JSON.parse(readFileSync('../../public/strip-freq.json', 'utf8'));

// ── Helpers ───────────────────────────────────────────────────────────────────

function countTypes(row, col, dir, length) {
  let ex2 = 0, ex3 = 0, px2 = 0, px3 = 0;

  for (let i = 0; i < length; i++) {
    const r = dir === 'V' ? row + i : row;
    const c = dir === 'H' ? col + i : col;
    const t = DESCRIPTION_BOARD[r][c];

    if (t === 'ex2') ex2++;
    else if (t === 'ex3') ex3++;
    else if (t === 'px2') px2++;
    else if (t === 'px3' || t === 'px3star') px3++;
  }

  return { ex2, ex3, px2, px3 };
}

// ── Analyze ───────────────────────────────────────────────────────────────────

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    note: 'Combo statistics derived from strip-freq.json'
  },
  stats: {}
};

for (const [lenStr, strips] of Object.entries(data.weights)) {
  const len = parseInt(lenStr, 10);

  let total = 0;

  let c1 = 0; // ex2==1 && px3==2
  let c2 = 0; // ex3==2 && px2==1
  let c3 = 0; // ex2==1 && px2==2
  let c4 = 0; // ex2==2
  let c5 = 0; // px3==3

  for (const s of strips) {
    const { ex2, ex3, px2, px3 } = countTypes(s.row, s.col, s.dir, len);
    const w = s.weight;

    total += w;

    if (ex2 === 1 && px3 === 2) c1 += w;
    if (ex3 === 2 && px2 === 1) c2 += w;
    if (ex2 === 1 && px2 === 2) c3 += w;
    if (ex2 === 2)              c4 += w;
    if (px3 === 3)              c5 += w;
  }

  output.stats[len] = {
    totalWeight: total,
    combos: {
      ex2_1_px3_2: {
        prob: c1 / total
      },
      ex3_2_px2_1: {
        prob: c2 / total
      },
      ex2_1_px2_2: {
        prob: c3 / total
      },
      ex2_2: {
        prob: c4 / total
      },
      px3_3: {
        prob: c5 / total
      }
    }
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

writeFileSync(
  './combo-stats.json',
  JSON.stringify(output, null, 2),
  'utf8'
);

console.log('Done → combo-stats.json');