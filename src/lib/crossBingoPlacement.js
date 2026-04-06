/**
 * crossBingoPlacement.js  — v2  (popularity-aware)
 *
 * Replaces the three functions from the previous version:
 *   selectRealisticPlacement   ← now blends popularity + heatmap
 *   selectLockPositions        ← unchanged from v1 (non-adjacent, edge-aware)
 *   passesRealismFilter        ← unchanged from v1
 *
 * Setup:
 *   1. Run `node simulate-strip-popularity.mjs` once → produces strip-freq.json
 *   2. Load strip-freq.json at startup (see loadPopularityWeights below)
 *   3. The rest of generateBingo() stays identical
 *
 * Blend formula:
 *   finalWeight = α × popularityWeight  +  (1−α) × heatmapWeight
 *
 *   α = POPULARITY_ALPHA (0 = pure heatmap, 1 = pure popularity)
 *   Default α = 0.65  — popularity-dominant but still respects bonus cells
 */

import { DESCRIPTION_BOARD } from './boardConstants.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const POPULARITY_ALPHA   = 0.55;   // blend weight toward popularity data

// ─── Board constants ──────────────────────────────────────────────────────────

const BOARD_SIZE  = 15;
const CENTER_R    = 7;
const CENTER_C    = 7;
const MAX_DIST    = 14;
const BONUS_WEIGHT = { px1: 0, px2: 1, px3: 2, px3star: 0, ex2: 6, ex3: 6 };

// ─── Heatmap (precomputed once) ───────────────────────────────────────────────

function buildHeatmap() {
  return DESCRIPTION_BOARD.map((row, r) =>
    row.map((cell, c) => {
      const dist = Math.abs(r - CENTER_R) + Math.abs(c - CENTER_C);
      return (MAX_DIST - dist) + (BONUS_WEIGHT[cell] ?? 0);
    })
  );
}
const HEATMAP = buildHeatmap();

// ─── Popularity data loader ───────────────────────────────────────────────────

/**
 * popularityMap[len] = Map<"row:col:dir", normalised_weight>
 *
 * Loaded once at module init.  If strip-freq.json is missing, falls back to
 * pure heatmap mode (POPULARITY_ALPHA effectively becomes 0).
 */
let popularityMap = null;
let slotProbsMap  = null;
// true once initPopularityWeights() has written real data — prevents loadPopularityWeights
// from overwriting the real maps with empty fallback maps.
let popularityLoaded = false;

function loadPopularityWeights() {
  if (popularityLoaded) return;   // real data already written by initPopularityWeights
  if (popularityMap !== null) return;  // init in-progress; maps will be filled shortly
  // initPopularityWeights() hasn't been called yet — use empty fallback maps
  console.warn(
    '[crossBingoPlacement] Popularity weights not loaded. ' +
    'Call initPopularityWeights() at app boot. Falling back to pure heatmap.'
  );
  popularityMap = {};
  slotProbsMap  = {};
}

/**
 * initPopularityWeights(jsonUrl?)
 *
 * Async loader for browser/bundler environments.
 * Call once at app boot before generateBingo() is first used.
 *
 *   import { initPopularityWeights } from './crossBingoPlacement.js';
 *   await initPopularityWeights();
 */
export async function initPopularityWeights(jsonUrl = '/strip-freq.json') {
  try {
    const res  = await fetch(jsonUrl);
    const data = await res.json();
    // BUG FIX: reset both maps before the loop — previously slotProbsMap was still
    // null here, causing `null[len] = ...` to throw and silently fall into the catch
    // block, leaving slotProbsMap as {} and all slotProbs unloaded.
    popularityMap = {};
    slotProbsMap  = {};

    for (const [lenStr, strips] of Object.entries(data.weights)) {
      const len      = parseInt(lenStr, 10);
      const map      = new Map();
      const probsMap = new Map();
      for (const s of strips) {
        const key = `${s.row}:${s.col}:${s.dir}`;
        map.set(key, s.weight);
        if (s.slotProbs) probsMap.set(key, s.slotProbs);
      }
      popularityMap[len] = map;
      slotProbsMap[len]  = probsMap;
      console.log(`[initPopularityWeights] len=${len}: ${map.size} strips loaded, slotProbs available on ${probsMap.size} strips`);
    }

    popularityLoaded = true;
    console.log('[crossBingoPlacement] strip-freq.json loaded successfully.');
  } catch (err) {
    console.error('[crossBingoPlacement] Failed to load strip-freq.json:', err.message);
    popularityMap = {};
    slotProbsMap  = {};
  }
}

// ─── Strip catalogue (enumerated per length, memoised) ────────────────────────

const _stripCache = new Map();

function enumerateStrips(length) {
  if (_stripCache.has(length)) return _stripCache.get(length);

  const strips = [];

  const addStrip = (startR, startC, dir) => {
    const cells = [];
    let heatSum       = 0;
    let bonusCount    = 0;

    // ── Bonus-type counters (NEW) ────────────────────────────────────────────
    let ex2Count     = 0;
    let ex3Count     = 0;
    let px2Count     = 0;
    let px3Count     = 0;
    let letterMulSum = 0;   // sum of per-cell letter multipliers (captures px2 via lm=2)

    let hasCenterStar = false;

    for (let i = 0; i < length; i++) {
      const r = dir === 'V' ? startR + i : startR;
      const c = dir === 'H' ? startC + i : startC;
      const type = DESCRIPTION_BOARD[r][c];
      
      if (type === 'px3star') hasCenterStar = true;

      cells.push({ r, c, type });
      heatSum += HEATMAP[r][c];

      if (type !== 'px1') bonusCount++;

      // Count each bonus type (NEW)
      if      (type === 'ex2')                        ex2Count++;
      else if (type === 'ex3')                        ex3Count++;
      else if (type === 'px2')                        px2Count++;
      else if (type === 'px3' || type === 'px3star')  px3Count++;
      // px2 is captured via letterMulSum (lm = 2); no separate counter needed

      // Letter multiplier for estimated score model (NEW)
      const lm = (type === 'px3' || type === 'px3star') ? 3
               : (type === 'px2')                        ? 2
               :                                           1;
      letterMulSum += lm;
    }

    if (hasCenterStar) return;

    const endR = dir === 'V' ? startR + length - 1 : startR;
    const endC = dir === 'H' ? startC + length - 1 : startC;
    const edgePenalty = (startR < 2 || endR > 12 || startC < 2 || endC > 12) ? 3 : 0;

    // ── Original base score (unchanged) ─────────────────────────────────────
    let rawHeat = (heatSum / length) * 2.5 + bonusCount * 2.0;
    if (dir === 'V')   rawHeat += 1.5;
    rawHeat -= edgePenalty;
    rawHeat  = Math.max(0.01, rawHeat);

    // ── Estimated score model (NEW) ──────────────────────────────────────────
    // Approximates real A-Math scoring:
    //   final = (avg letter multiplier) × (word multiplier stack)
    // avgLetterMul ∈ [1, 3]; wordMult ∈ {1, 2, 3, 4, 6, 8, 9, …}
    const avgLetterMul   = letterMulSum / length;
    const wordMult       = (2 ** ex2Count) * (3 ** ex3Count);
    const estimatedScore = avgLetterMul * wordMult;
    rawHeat += Math.log(1 + estimatedScore) * 4;

    // ── Combo pattern bonuses (NEW) ──────────────────────────────────────────
    if (length == 9) {
      if (ex2Count == 1 && px3Count == 2) rawHeat += 10000.0;   // ex2 + px3 + px3
      if (ex3Count == 2 && px2Count == 1) rawHeat += 10000.0;   // ex3 + px2
      if (ex2Count == 1 && px2Count == 2) rawHeat += 2000.0;   // ex2 + px2 + px2
      if (ex2Count == 2) rawHeat += 7000.0;
      if (px3Count == 3) rawHeat += 1000.0;
    }
  
    rawHeat = Math.max(0.01, rawHeat);

    strips.push({
      row:     startR,
      col:     startC,
      dir,
      cells,
      rawHeat,
      bonusCount,
    });
  };

  // Horizontal only (r0–r6)
  for (let r = 0; r <= 6; r++) {
    for (let c = 0; c <= BOARD_SIZE - length; c++) {
      addStrip(r, c, 'H');
    }
  }

  // Normalise rawHeat scores to [0, 1] for blending
  for (const s of strips) {
    s.normHeat = Math.log(1 + s.rawHeat);
  }

  const maxHeat = Math.max(...strips.map(s => s.normHeat)) || 1;

  for (const s of strips) {
    s.normHeat = s.normHeat / maxHeat;
  }
  
  _stripCache.set(length, strips);
  return strips;
}

// ─── Weighted sampler ─────────────────────────────────────────────────────────

function weightedSample(items, weights) {
  let total = 0;
  for (const w of weights) total += w;

  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }

  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── 1. selectRealisticPlacement ─────────────────────────────────────────────

/**
 * selectRealisticPlacement(totalTile)
 *
 * Picks a strip using:
 *   finalWeight = POPULARITY_ALPHA × popularityWeight  +  (1−POPULARITY_ALPHA) × normHeat
 *
 * Falls back to pure normHeat when strip-freq.json is absent or the strip
 * wasn't seen during simulation (weight defaults to a small nonzero value).
 *
 * Returns { rowIdx, colStart, dir, rowSlots, cells }
 */
// Two fixed strips at row 7 (center row) used exclusively for 8-tile cross bingo.
// Left strip: cols 0-7 (ex3…px3star), Right strip: cols 7-14 (px3star…ex3)
const EIGHT_TILE_STRIPS = [
  {
    row: 7, col: 0, dir: 'H',
    cells: [
      { r: 7, c: 0,  type: 'ex3'    },
      { r: 7, c: 1,  type: 'px1'    },
      { r: 7, c: 2,  type: 'px1'    },
      { r: 7, c: 3,  type: 'px2'    },
      { r: 7, c: 4,  type: 'px1'    },
      { r: 7, c: 5,  type: 'px1'    },
      { r: 7, c: 6,  type: 'px1'    },
      { r: 7, c: 7,  type: 'px3star' },
    ],
  },
  {
    row: 7, col: 7, dir: 'H',
    cells: [
      { r: 7, c: 7,  type: 'px3star' },
      { r: 7, c: 8,  type: 'px1'    },
      { r: 7, c: 9,  type: 'px1'    },
      { r: 7, c: 10, type: 'px1'    },
      { r: 7, c: 11, type: 'px2'    },
      { r: 7, c: 12, type: 'px1'    },
      { r: 7, c: 13, type: 'px1'    },
      { r: 7, c: 14, type: 'ex3'    },
    ],
  },
];

export function selectRealisticPlacement(totalTile, forceHeatmapOnly = false) {
  // 8-tile cross bingo uses one of the two fixed center-row strips
  if (totalTile === 8) {
    const strip = EIGHT_TILE_STRIPS[Math.floor(Math.random() * 2)];
    return {
      rowIdx:   strip.row,
      colStart: strip.col,
      dir:      strip.dir,
      rowSlots: strip.cells.map(c => c.type),
      cells:    strip.cells,
      slotProbs: Array(8).fill(1 / 8),
    };
  }

  loadPopularityWeights();

  const strips  = enumerateStrips(totalTile);
  const popMap  = popularityMap[totalTile] ?? null;
  const alpha = forceHeatmapOnly ? 0 : (popMap ? POPULARITY_ALPHA : 0);

  // Build blended weights
  const weights = strips.map(s => {
    const popW = popMap ? (popMap.get(`${s.row}:${s.col}:H`) ?? 0.05) : 0;
    const blend = alpha * popW + (1 - alpha) * s.normHeat;
    // Square the weight to sharpen the distribution toward popular strips
    return Math.pow(Math.max(1e-6, blend), 1.3);
  });

  const strip    = weightedSample(strips, weights);
  const stripKey = `${strip.row}:${strip.col}:${strip.dir}`;
  const probsMap  = slotProbsMap?.[totalTile];
  const fromJson  = probsMap?.get(stripKey);
  const slotProbs = fromJson ?? Array(totalTile).fill(1 / totalTile);

  console.log(
    `[selectRealisticPlacement] totalTile=${totalTile} → strip=${stripKey}`,
    fromJson
      ? `slotProbs from JSON: [${slotProbs.join(', ')}]`
      : `slotProbs FALLBACK (equal): [${slotProbs.map(p => p.toFixed(3)).join(', ')}]`
  );

  return {
    rowIdx:   strip.row,
    colStart: strip.col,
    dir:      strip.dir,
    rowSlots: strip.cells.map(cell => cell.type),  // always sourced from real board
    cells:    strip.cells,
    slotProbs,
  };
}

// ─── 2. selectLockPositions ──────────────────────────────────────────────────

/**
 * selectLockPositions(totalTile, lockCount, placement)
 *
 * Lock positions are driven entirely by placement.slotProbs from strip-freq.json:
 *   prob = 0    → slot is never locked (hard exclusion, no fallback override)
 *   prob >= 1   → slot is always locked (force-lock, processed first)
 *   0 < prob < 1 → weighted random selection
 *
 * Adjacency rule (gap ≥ 2) still applies between all chosen positions.
 * Warns via console when edge cases are hit (too many force-locks, can't fill quota).
 */
export function selectLockPositions(totalTile, lockCount, placement) {
  if (lockCount <= 0)         return [];
  if (lockCount >= totalTile) return Array.from({ length: totalTile }, (_, i) => i);

  const { slotProbs } = placement;
  const probs = slotProbs ?? Array(totalTile).fill(1 / totalTile);

  // Categorise slots
  const mustLock = [];      // prob >= 1 → always locked
  const eligible = [];      // 0 < prob < 1 → weighted random
  // prob === 0 → excluded entirely, never picked even as fallback

  for (let i = 0; i < totalTile; i++) {
    const p = probs[i] ?? 0;
    if (p >= 1)     mustLock.push(i);
    else if (p > 0) eligible.push({ i, score: p });
  }

  mustLock.sort((a, b) => a - b);

  const safeMustLock = [];
  for (const pos of mustLock) {
    if (safeMustLock.every(p => Math.abs(p - pos) > 1)) {
      safeMustLock.push(pos);
    } else {
      console.warn(`[selectLockPositions] removed adjacent mustLock at ${pos}`);
    }
  }

  // ใช้ตัวที่ clean แล้วแทน
  mustLock.length = 0;
  mustLock.push(...safeMustLock);

  console.log(
    `[selectLockPositions] totalTile=${totalTile} lockCount=${lockCount}`,
    `| mustLock=[${mustLock.join(',')}]`,
    `| eligible=[${eligible.map(c => `${c.i}(${c.score})`).join(', ')}]`,
    `| excluded(prob=0)=[${Array.from({length: totalTile}, (_, i) => i).filter(i => (probs[i] ?? 0) === 0).join(',')}]`
  );

  // Edge case: force-locks alone exceed quota
  if (mustLock.length > lockCount) {
    console.warn(
      `[selectLockPositions] ${mustLock.length} must-lock slots exceed lockCount=${lockCount}. ` +
      'Using first ' + lockCount + '. Check slotProbs in strip-freq.json.'
    );
    return mustLock.slice(0, lockCount).sort((a, b) => a - b);
  }

  // Start with force-locked slots, block their neighbours
  const chosen  = [...mustLock];
  const blocked = new Set();
  for (const fi of chosen) {
    if (fi - 1 >= 0) blocked.add(fi - 1);
    blocked.add(fi);
    if (fi + 1 < totalTile) blocked.add(fi + 1);
  }

  // Weighted random from eligible, respecting adjacency
  const remaining = eligible.filter(c =>
    !blocked.has(c.i) &&
    chosen.every(p => Math.abs(p - c.i) > 1)
  );

  while (chosen.length < lockCount && remaining.length > 0) {
    const weights = remaining.map(c => c.score);
    const pick    = weightedSample(remaining, weights);
    chosen.push(pick.i);
    blocked.add(pick.i - 1); blocked.add(pick.i); blocked.add(pick.i + 1);
    for (let k = remaining.length - 1; k >= 0; k--) {
      if (blocked.has(remaining[k].i)) remaining.splice(k, 1);
    }
  }

  // Edge case: couldn't fill quota (prob=0 blocked too many positions)
  if (chosen.length < lockCount) {
    console.warn(
      `[selectLockPositions] Could only lock ${chosen.length}/${lockCount} positions. ` +
      'Not enough eligible slots after adjacency + prob=0 exclusions. Check slotProbs in strip-freq.json.'
    );
  }

  function hasAdjacent(arr) {
    arr.sort((a, b) => a - b);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] - arr[i - 1] <= 1) return true;
    }
    return false;
  }
  
  const result = chosen.sort((a, b) => a - b);
  
  if (hasAdjacent(result)) {
    console.warn('[selectLockPositions] adjacency detected → retry');
    return selectLockPositions(totalTile, lockCount, placement);
  }
  
  return result;
}

// ─── 3. passesRealismFilter ──────────────────────────────────────────────────

/**
 * passesRealismFilter(placement)
 *
 * Rejects strips that are entirely plain cells (no bonus at all).
 * Lock position selection is fully driven by slotProbs — no additional conditions here.
 */
export function passesRealismFilter(placement) {
  const { rowSlots } = placement;
  return rowSlots.some(t => t !== 'px1');
}

// ─── Browser/bundler variant ──────────────────────────────────────────────────
//
// If you're using this in a browser (no fs module), replace loadPopularityWeights:
//
//   let freqData = null;
//
//   export async function initPopularityWeights(jsonUrl = '/strip-freq.json') {
//     const res  = await fetch(jsonUrl);
//     const data = await res.json();
//     popularityMap = {};
//     for (const [lenStr, strips] of Object.entries(data.weights)) {
//       const map = new Map();
//       for (const s of strips) map.set(`${s.row}:${s.col}:${s.dir}`, s.weight);
//       popularityMap[parseInt(lenStr, 10)] = map;
//     }
//   }
//
//   // Call once at app boot:
//   await initPopularityWeights();
//
// ─────────────────────────────────────────────────────────────────────────────

// ─── generateBingo integration patch ─────────────────────────────────────────
//
//  In generateBingo(), the cross-mode block should look exactly like this:
//
//    let placement, lockPositions;
//    let filterTries = 0;
//    do {
//      placement     = selectRealisticPlacement(totalTile);           // ← imported from here
//      lockPositions = selectLockPositions(                           // ← imported from here
//        totalTile, lockCount, placement, solutionTiles
//      );
//      filterTries++;
//    } while (
//      !passesRealismFilter(placement, lockPositions, solutionTiles)  // ← imported from here
//      && filterTries < 10
//    );
//    const { rowSlots } = placement;
//
// ─────────────────────────────────────────────────────────────────────────────