// ================================================================
//  boardBuilder.js
//  Board layout: token mapping, fixed-tile selection, scoring,
//  and final board assembly for expand mode.
// ================================================================

import { tokenizeEquation } from './bingoMath.js';
import { HEAVY_SET, OPS_SET, analyzeTiles } from './tileHelpers.js';

export const BOARD_SIZE = 15;
export const BOARD_COLS = 5;
export const BOARD_ROWS = 3;
export const RACK_SIZE  = 8;

// ── Token → tile mapping ──────────────────────────────────────────────────────

export function buildTilePerToken(equationTokens, orderedSourceTiles) {
  const result = [];
  let si = 0;

  for (const tok of equationTokens) {
    if (si >= orderedSourceTiles.length) return null;

    if (tok === '=' || OPS_SET.has(tok)) {
      result.push({ token: tok, srcs: [orderedSourceTiles[si++]], src: orderedSourceTiles[si - 1] });
      continue;
    }

    const firstSrc = orderedSourceTiles[si];
    let tileCount;
    if (HEAVY_SET.has(firstSrc)) tileCount = 1;
    else if (firstSrc === '?' && HEAVY_SET.has(tok)) tileCount = 1;
    else tileCount = tok.replace(/^-/, '').length;

    const srcs = orderedSourceTiles.slice(si, si + tileCount);
    if (srcs.length !== tileCount) return null;
    si += tileCount;
    result.push({ token: tok, srcs, src: srcs[0] });
  }

  if (si !== orderedSourceTiles.length) return null;
  return result;
}

// ── Fixed-tile heuristic ──────────────────────────────────────────────────────

function eqPositionsFromTokens(tokens) {
  const pos = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i] === '=') pos.push(i);
  return pos;
}

function pickFixedIndicesHeuristic(equationTokens, tilePerToken, fixedCount) {
  const must = new Set(eqPositionsFromTokens(equationTokens));
  const remaining = fixedCount - must.size;
  if (remaining < 0) return null;
  if (remaining === 0) return [...must].sort((a, b) => a - b);

  const excluded = new Set(must);
  for (const p of must) { excluded.add(p - 1); excluded.add(p + 1); }

  const candidates = [];
  for (let i = 0; i < equationTokens.length; i++) {
    if (excluded.has(i)) continue;
    candidates.push(i);
  }

  const isOpSrc    = (src) => OPS_SET.has(src);
  const isHeavySrc = (src) => HEAVY_SET.has(src);

  const chosen  = [];
  const blocked = new Set();

  const scoreIdx = (i) => {
    const src = tilePerToken[i]?.srcs?.[0];
    if (!src) return 0;
    let s = 0;
    if (isHeavySrc(src)) s += 40;
    if (isOpSrc(src)) s += 8;
    if (!isOpSrc(src) && equationTokens[i] !== '=' && String(equationTokens[i]).length >= 2) s += 6;
    return s + Math.random();
  };

  for (let pick = 0; pick < remaining; pick++) {
    let best = null;
    for (const idx of candidates) {
      if (blocked.has(idx)) continue;
      const s = scoreIdx(idx);
      if (!best || s > best.s) best = { idx, s };
    }
    if (!best) break;
    chosen.push(best.idx);
    blocked.add(best.idx - 1); blocked.add(best.idx); blocked.add(best.idx + 1);
  }

  if (chosen.length < remaining) return null;
  return [...must, ...chosen].sort((a, b) => a - b);
}

// ── Layout scoring ────────────────────────────────────────────────────────────

function boardIndexToRowCol(idx) {
  return { r: (idx / BOARD_COLS) | 0, c: idx % BOARD_COLS };
}

function scorePlacement(space) {
  let penalty = 0;

  for (let r = 0; r < BOARD_ROWS; r++) {
    let opCount = 0, nonNull = 0;
    for (let c = 0; c < BOARD_COLS; c++) {
      const t = space[r * BOARD_COLS + c];
      if (t == null) continue;
      nonNull++;
      if (OPS_SET.has(t)) opCount++;
      if (t === '?') opCount += 0.4;
    }
    if (nonNull === 0) continue;
    if (opCount >= 3) penalty += 8 * (opCount - 2);
    if (opCount === 2) penalty += 1.5;
  }

  for (let i = 0; i < space.length; i++) {
    const t = space[i];
    if (t == null) continue;
    const { r, c } = boardIndexToRowCol(i);
    const neigh = [];
    if (c > 0)             neigh.push(space[i - 1]);
    if (c < BOARD_COLS - 1) neigh.push(space[i + 1]);
    if (r > 0)             neigh.push(space[i - BOARD_COLS]);
    if (r < BOARD_ROWS - 1) neigh.push(space[i + BOARD_COLS]);
    const isOpLike = (x) => x != null && (OPS_SET.has(x) || x === '=');
    if (isOpLike(t)) {
      const adj = neigh.filter(isOpLike).length;
      penalty += adj * 0.9;
    }
  }

  return penalty;
}

export function optimizeBoardLayout(board) {
  const { totalTile, fixedIndices } = board;
  const maxStart = BOARD_SIZE - totalTile;

  let best = null;
  for (let start = 0; start <= maxStart; start++) {
    const space = Array(BOARD_SIZE).fill(null);
    fixedIndices.forEach((slotIdx) => {
      space[start + slotIdx] = board.tileSlots?.[slotIdx]?.src ?? null;
    });
    const s = scorePlacement(space);
    if (!best || s < best.score) best = { start, space, score: s };
  }

  return {
    ...board,
    equationStart: best ? best.start  : board.equationStart,
    space:         best ? best.space  : board.space,
    layoutScore:   best ? best.score  : undefined,
  };
}

// ── Board assembly ────────────────────────────────────────────────────────────

export function buildBoard(eq, orderedSourceTiles, cfg, meta) {
  const { mode, totalTile, eqCount } = meta;
  const fixedCount = totalTile - RACK_SIZE;

  const equationTokens = tokenizeEquation(eq);
  if (!equationTokens) return null;
  const tilePerToken = buildTilePerToken(equationTokens, orderedSourceTiles);
  if (!tilePerToken) return null;

  const fixedTokenIndices = pickFixedIndicesHeuristic(equationTokens, tilePerToken, fixedCount);
  if (!fixedTokenIndices) return null;

  const fixedTokenSet = new Set(fixedTokenIndices);

  const tileSlots = [];
  tilePerToken.forEach((tt, ti) => {
    tt.srcs.forEach((src, k) => {
      tileSlots.push({ tokenIndex: ti, tileOffset: k, src });
    });
  });
  if (tileSlots.length !== totalTile) return null;

  const fixedTileIndices = [];
  for (let i = 0; i < tileSlots.length; i++) {
    if (fixedTokenSet.has(tileSlots[i].tokenIndex)) fixedTileIndices.push(i);
  }
  if (fixedTileIndices.length !== fixedCount) return null;

  const fixedTileSet = new Set(fixedTileIndices);
  const rack = tileSlots
    .filter((_, i) => !fixedTileSet.has(i))
    .map(s => s.src);

  if (rack.some(t => t === '=')) return null;
  if (rack.length !== RACK_SIZE) return null;

  const maxStart = BOARD_SIZE - totalTile;
  const equationStart = 0 | (Math.random() * (maxStart + 1));
  const space = Array(BOARD_SIZE).fill(null);

  fixedTileIndices.forEach((ti) => {
    space[equationStart + ti] = tileSlots[ti].src;
  });

  const baseBoard = {
    mode,
    space,
    equationStart,
    equation: eq,
    equationTokens: equationTokens.map((t, ti) => ({ token: t, tokenIndex: ti })),
    fixedIndices: fixedTileIndices,
    rack,
    analysis: analyzeTiles(orderedSourceTiles),
    tilePerToken,
    tileSlots,
    totalTile,
    eqCount,
  };

  const optimized = optimizeBoardLayout(baseBoard);

  const {
    tilePerToken: _tpt,
    tileSlots: _slots,
    totalTile: _tt,
    eqCount: _eqc,
    layoutScore,
    ...publicBoard
  } = optimized;

  return { ...publicBoard, layoutScore };
}
