// ================================================================
//  bingoBacktrackAlgorithm.js — Structure-first backtrack builder
// ================================================================

import { findEquationsWithTiles } from './equationAnagramLogic.ts';
import { POOL_DEF } from './equationConstructors.js';
import { LIGHT_DIGS, HEAVY_LIST, withinPoolLimits } from './tileHelpers.js';
import { toRange, randInt } from './bingoMath.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_SAMPLE_ATTEMPTS = 3000;

// ── Debug ──────────────────────────────────────────────────────────────────────
// Set to true to enable verbose per-attempt logging.
// Set to false (or remove) before deploying to production.
const DEBUG = true;

// Log only first DETAIL_LIMIT detailed-failure messages per call, then switch to
// summary-only to avoid console spam on 3000-attempt runs.
const DETAIL_LIMIT = 5;

function dbg(...args) {
  if (DEBUG) console.log('[BT]', ...args);
}

// ── Token helpers ──────────────────────────────────────────────────────────────

const CORE_OPS    = ['+', '-', '×', '÷'];
const CHOICE_OPS  = ['+/-', '×/÷'];
const ALL_OP_TOKENS = [...CORE_OPS, ...CHOICE_OPS];

function clonePool(poolDef) { return Object.assign({}, poolDef); }

function pickOne(pool, candidates) {
  const avail = candidates.filter(t => (pool[t] ?? 0) > 0);
  if (!avail.length) return null;
  const t = avail[Math.floor(Math.random() * avail.length)];
  pool[t]--;
  return t;
}

// ── Divisor-pair picker ─────────────────────────────────────────────────────

/**
 * Find all (dividend, divisor) pairs available in pool where dividend % divisor === 0.
 * Pick one pair at random, decrement pool, and return [dividendStr, divisorStr].
 * Returns null if no valid pair exists.
 */
function pickDivisorPair(pool) {
  const avail = LIGHT_DIGS.filter(d => (pool[d] ?? 0) > 0);
  const pairs = [];
  for (const divisorStr of avail) {
    const divisor = parseInt(divisorStr);
    for (const dividendStr of avail) {
      const dividend = parseInt(dividendStr);
      if (dividend === 0) continue;
      if (dividendStr === divisorStr) {
        if ((pool[dividendStr] ?? 0) >= 2) pairs.push([dividendStr, divisorStr]);
      } else if (dividend % divisor === 0) {
        pairs.push([dividendStr, divisorStr]);
      }
    }
  }
  if (!pairs.length) return null;
  const [dndStr, divStr] = pairs[Math.floor(Math.random() * pairs.length)];
  pool[dndStr] = (pool[dndStr] ?? 0) - 1;
  pool[divStr] = (pool[divStr] ?? 0) - 1;
  return [dndStr, divStr];
}

// ── Operator sampler ────────────────────────────────────────────────────────

function sampleOperators(N_ops, opSpec, pool) {
  const tally = {};
  for (const op of ALL_OP_TOKENS) tally[op] = 0;
  let used = 0;

  if (opSpec && Object.keys(opSpec).length > 0) {
    for (const op of ALL_OP_TOKENS) {
      const r = toRange(opSpec[op]);
      if (!r) continue;
      const lo = r[0];
      const canPick = Math.min(lo, pool[op] ?? 0, N_ops - used);
      if (canPick < lo) return null;
      tally[op] += canPick;
      pool[op] = (pool[op] ?? 0) - canPick;
      used += canPick;
    }
    while (used < N_ops) {
      const eligible = ALL_OP_TOKENS.filter(op => {
        if ((pool[op] ?? 0) <= 0) return false;
        const r = toRange(opSpec[op]);
        return r == null || tally[op] < r[1];
      });
      if (!eligible.length) return null;
      const op = eligible[Math.floor(Math.random() * eligible.length)];
      tally[op]++; pool[op]--; used++;
    }
  } else {
    for (let i = 0; i < N_ops; i++) {
      const op = pickOne(pool, CORE_OPS);
      if (!op) return null;
      tally[op]++;
    }
  }

  const result = [];
  for (const op of ALL_OP_TOKENS) {
    for (let i = 0; i < tally[op]; i++) result.push(op);
  }
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Token set sampler ───────────────────────────────────────────────────────

/**
 * Sample a tile multiset of exactly `totalTile` tokens satisfying the config.
 * Returns { tokens, failReason } — tokens is null on failure.
 */
function sampleTokenSet(totalTile, cfg, eqCount, poolDef, opBounds) {
  const pool = clonePool(poolDef);
  const tokens = [];

  // ── 1. Equals ────────────────────────────────────────────────────────────
  for (let i = 0; i < eqCount; i++) {
    if ((pool['='] ?? 0) <= 0) return { tokens: null, failReason: 'POOL_NO_EQUALS' };
    tokens.push('=');
    pool['=']--;
  }

  // ── 2. Operator count ─────────────────────────────────────────────────────
  const { rawOpLo, rawOpHi } = opBounds;

  const feasible = [];
  for (let n = rawOpLo; n <= rawOpHi; n++) {
    const numBudget = totalTile - eqCount - n;
    const numSlots  = n + eqCount + 1;
    const tight = eqCount === 1 && (numBudget === n + 1 || numBudget === n);
    if ((numBudget >= numSlots || tight) && numBudget <= 3 * numSlots) {
      feasible.push(n);
    }
  }
  if (!feasible.length) {
    return { tokens: null, failReason: `NO_FEASIBLE_N_OPS (range [${rawOpLo},${rawOpHi}], totalTile=${totalTile}, eqCount=${eqCount})` };
  }

  const N_ops     = feasible[Math.floor(Math.random() * feasible.length)];
  const numBudget = totalTile - eqCount - N_ops;

  // ── 3. Operators ──────────────────────────────────────────────────────────
  const ops = sampleOperators(N_ops, cfg.operatorSpec ?? null, pool);
  if (!ops) {
    return { tokens: null, failReason: `OPERATOR_SAMPLE_FAIL (N_ops=${N_ops}, spec=${JSON.stringify(cfg.operatorSpec ?? null)})` };
  }
  tokens.push(...ops);

  // ── 4. Heavy-number tiles ─────────────────────────────────────────────────
  const heavyRange  = toRange(cfg.heavyCount);
  const heavyLo     = heavyRange ? heavyRange[0] : 0;
  const heavyHiRaw  = heavyRange ? heavyRange[1] : 0;
  const heavyHi     = Math.min(heavyHiRaw, numBudget - 1);
  const heavyCount  = (heavyLo <= heavyHi) ? randInt(heavyLo, heavyHi) : 0;

  for (let i = 0; i < heavyCount; i++) {
    const h = pickOne(pool, HEAVY_LIST);
    if (!h) return { tokens: null, failReason: `POOL_NO_HEAVY (need ${heavyCount})` };
    tokens.push(h);
  }

  // ── 5. Blank tiles ─────────────────────────────────────────────────────────
  const blankRange  = toRange(cfg.blankCount);
  const wildRange   = toRange(cfg.wildcardCount);
  const blankLo     = (blankRange ? blankRange[0] : 0) + (wildRange ? wildRange[0] : 0);
  const blankHiRaw  = (blankRange ? blankRange[1] : 0) + (wildRange ? wildRange[1] : 0);
  const blankBudget = numBudget - heavyCount;
  const blankHi     = Math.min(blankHiRaw, blankBudget - 1, pool['?'] ?? 0);
  const blankCount  = (blankLo <= blankHi) ? randInt(blankLo, blankHi) : 0;

  for (let i = 0; i < blankCount; i++) {
    if ((pool['?'] ?? 0) <= 0) return { tokens: null, failReason: `POOL_NO_BLANK (need ${blankCount})` };
    tokens.push('?');
    pool['?']--;
  }

  // ── 6. Light-digit tiles ──────────────────────────────────────────────────
  const lightCount = numBudget - heavyCount - blankCount;
  if (lightCount < 1) {
    return { tokens: null, failReason: `LIGHT_COUNT_ZERO (numBudget=${numBudget}, heavy=${heavyCount}, blank=${blankCount})` };
  }

  const divCount = ops.filter(op => op === '÷' || op === '×/÷').length;
  if (divCount > 0 && lightCount >= 2) {
    const pairsNeeded = Math.min(divCount, Math.floor(lightCount / 2));
    let pairsPicked = 0;
    for (let p = 0; p < pairsNeeded; p++) {
      if (lightCount - pairsPicked * 2 < 2) break;
      const pair = pickDivisorPair(pool);
      if (pair) {
        tokens.push(pair[0], pair[1]);
        pairsPicked++;
      } else {
        break;
      }
    }
    if (pairsPicked > 0) {
      const filledSoFar = pairsPicked * 2;
      for (let i = filledSoFar; i < lightCount; i++) {
        const d = pickOne(pool, LIGHT_DIGS);
        if (!d) return { tokens: null, failReason: `POOL_NO_LIGHT_DIGIT (div-bias path, i=${i})` };
        tokens.push(d);
      }
      if (tokens.length !== totalTile) {
        return { tokens: null, failReason: `LENGTH_MISMATCH (div-bias, got=${tokens.length}, want=${totalTile})` };
      }
      return { tokens, failReason: null };
    }
  }

  for (let i = 0; i < lightCount; i++) {
    const d = pickOne(pool, LIGHT_DIGS);
    if (!d) return { tokens: null, failReason: `POOL_NO_LIGHT_DIGIT (random path, i=${i})` };
    tokens.push(d);
  }

  if (tokens.length !== totalTile) {
    return { tokens: null, failReason: `LENGTH_MISMATCH (got=${tokens.length}, want=${totalTile})` };
  }
  return { tokens, failReason: null };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function equationFirstBuilderBacktrack(totalTile, cfg, eqCount, poolDef = POOL_DEF) {
  // ── Pre-compute op bounds (done once, logged once) ─────────────────────────
  const opRange = toRange(cfg.operatorCount);
  let rawOpLo = opRange ? opRange[0] : 1;
  let rawOpHi = opRange ? opRange[1] : 3;
  let specMinOps = 0;

  if (cfg.operatorSpec) {
    for (const r of Object.values(cfg.operatorSpec)) {
      const range = toRange(r);
      if (range) specMinOps += range[0];
    }
    if (specMinOps > 0) {
      rawOpLo = Math.max(rawOpLo, specMinOps);
      rawOpHi = Math.max(rawOpHi, specMinOps);
    }
  }

  const opBounds = { rawOpLo, rawOpHi };

  // ── Initial debug dump ─────────────────────────────────────────────────────
  dbg('━━━ equationFirstBuilderBacktrack START ━━━');
  dbg('  totalTile:', totalTile, '| eqCount:', eqCount);
  dbg('  cfg.operatorCount:', cfg.operatorCount ?? '(not set)');
  dbg('  cfg.operatorSpec:', cfg.operatorSpec ? JSON.stringify(cfg.operatorSpec) : '(not set)');
  dbg('  cfg.heavyCount:', cfg.heavyCount ?? '(not set)');
  dbg('  cfg.blankCount:', cfg.blankCount ?? '(not set)');
  dbg('  specMinOps derived from spec:', specMinOps);
  dbg('  rawOpLo:', rawOpLo, '| rawOpHi:', rawOpHi,
      opRange ? '(from operatorCount)' : specMinOps > 0 ? '← extended from specMinOps' : '(defaults)');
  dbg('  MAX_SAMPLE_ATTEMPTS:', MAX_SAMPLE_ATTEMPTS);

  // ── Failure counters ───────────────────────────────────────────────────────
  const failCount = {};
  let sampleNullCount  = 0;
  let viabilityFail    = 0;
  let poolLimitFail    = 0;
  let dfsFail          = 0;
  let detailsPrinted   = 0;

  // ── Main loop ──────────────────────────────────────────────────────────────
  for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
    const verbose = DEBUG && detailsPrinted < DETAIL_LIMIT;

    // ── Sample ────────────────────────────────────────────────────────────
    const { tokens: tokenArr, failReason } = sampleTokenSet(totalTile, cfg, eqCount, poolDef, opBounds);

    if (!tokenArr) {
      sampleNullCount++;
      failCount[failReason] = (failCount[failReason] || 0) + 1;
      if (verbose) {
        dbg(`  [attempt ${attempt}] sampleTokenSet FAILED → ${failReason}`);
        detailsPrinted++;
      }
      continue;
    }

    // ── Quick viability checks ─────────────────────────────────────────────
    const hasNum = tokenArr.some(t => /^\d/.test(t));
    const hasOp  = tokenArr.some(t => ALL_OP_TOKENS.includes(t));
    const hasEq  = tokenArr.some(t => t === '=' || t === '?');

    if (!hasNum || !hasOp || !hasEq) {
      viabilityFail++;
      const reason = `VIABILITY (hasNum=${hasNum}, hasOp=${hasOp}, hasEq=${hasEq})`;
      failCount[reason] = (failCount[reason] || 0) + 1;
      if (verbose) {
        dbg(`  [attempt ${attempt}] viability check FAILED → tokens=[${tokenArr.join(',')}]`);
        detailsPrinted++;
      }
      continue;
    }

    // ── Pool limits ────────────────────────────────────────────────────────
    const counts = {};
    for (const t of tokenArr) counts[t] = (counts[t] || 0) + 1;

    if (!withinPoolLimits(counts, poolDef)) {
      poolLimitFail++;
      failCount['POOL_LIMIT_EXCEEDED'] = (failCount['POOL_LIMIT_EXCEEDED'] || 0) + 1;
      if (verbose) {
        dbg(`  [attempt ${attempt}] pool limit EXCEEDED → tokens=[${tokenArr.join(',')}]`);
        detailsPrinted++;
      }
      continue;
    }

    // ── DFS ────────────────────────────────────────────────────────────────
    if (verbose) {
      dbg(`  [attempt ${attempt}] running DFS on tokens=[${tokenArr.join(',')}]`);
    }
    const t0 = DEBUG ? performance.now() : 0;
    const found = findEquationsWithTiles(tokenArr, eqCount);
    const elapsed = DEBUG ? (performance.now() - t0).toFixed(1) : 0;

    if (!found.length) {
      dfsFail++;
      failCount['DFS_NO_EQUATION'] = (failCount['DFS_NO_EQUATION'] || 0) + 1;
      if (verbose) {
        dbg(`  [attempt ${attempt}] DFS found NOTHING (${elapsed}ms) → tokens=[${tokenArr.join(',')}]`);
        detailsPrinted++;
      }
      continue;
    }

    // ── Success ────────────────────────────────────────────────────────────
    const best = found.reduce((a, b) => _wildCount(b.tiles) < _wildCount(a.tiles) ? b : a);

    dbg(`✓ SUCCESS at attempt ${attempt}`);
    dbg('  equation:', best.equation);
    dbg('  tiles:', best.tiles.join(' | '));
    dbg('  DFS time:', elapsed + 'ms');
    dbg('  failure summary before success →',
      `sampleNull=${sampleNullCount}`, `viability=${viabilityFail}`,
      `poolLimit=${poolLimitFail}`, `dfsFail=${dfsFail}`);
    if (Object.keys(failCount).length) {
      dbg('  failure breakdown:', failCount);
    }

    return {
      tileCounts: counts,
      seedEquation: best.equation,
      solutionTiles: best.tiles,
    };
  }

  // ── Exhausted ──────────────────────────────────────────────────────────────
  dbg('✗ EXHAUSTED all', MAX_SAMPLE_ATTEMPTS, 'attempts — returning null');
  dbg('  failure breakdown:', failCount);
  dbg('  totals →',
    `sampleNull=${sampleNullCount}`, `viability=${viabilityFail}`,
    `poolLimit=${poolLimitFail}`, `dfsFail=${dfsFail}`);
  dbg('  config was → totalTile:', totalTile, 'eqCount:', eqCount,
    'rawOpLo:', rawOpLo, 'rawOpHi:', rawOpHi,
    'operatorSpec:', cfg.operatorSpec ? JSON.stringify(cfg.operatorSpec) : 'none');
  dbg('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return null;
}

function _wildCount(tiles) {
  return tiles.filter(t => t === '?' || t === '+/-' || t === '×/÷').length;
}
