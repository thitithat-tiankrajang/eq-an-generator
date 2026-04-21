// ================================================================
//  A-MATH BINGO — Tile Helpers  (tileHelpers.js)
//
//  Tile analysis: pool checks, equation-to-tile conversion,
//  tile-count analysis.  Depends only on bingoMath.
// ================================================================

import {
  OPS_ALL,
  tokenizeEquation,
  toRange,
  inRange,
  inc,
  sumCounts,  // re-exported below for callers that pull from here
} from './bingoMath.js';

export { sumCounts };

// ── Tile category constants ───────────────────────────────────────────────────
export const LIGHT_DIGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const HEAVY_LIST = ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
export const HEAVY_SET  = new Set(HEAVY_LIST);
export const OPS_SET    = new Set(['+', '-', '×', '÷', '+/-', '×/÷']);
export const WILDS_SET  = new Set(['?', '+/-', '×/÷']);

// ── Tile count utilities ──────────────────────────────────────────────────────

/**
 * numTiles(n) — number of A-Math tiles used by integer n.
 * Heavy tiles 10–20 use 1 tile each; others use 1 tile per digit character.
 */
export function numTiles(n) {
  if (n >= 10 && n <= 20) return 1;  // heavy tile (one physical tile)
  if (n >= 0  && n <= 9)  return 1;  // single digit
  return String(Math.abs(n)).length; // multi-digit: count characters
}

/** makeCounts(poolDef) — shallow copy of a pool definition object. */
export function makeCounts(poolDef) {
  return Object.fromEntries(Object.entries(poolDef).map(([k, v]) => [k, v]));
}

// ── Equation → tiles ─────────────────────────────────────────────────────────

/**
 * equationToTileCounts(eq, opts)
 *
 * Convert an equation string to a multiset of tiles.
 * Numbers 10–20 prefer heavy tiles (1 tile) when preferHeavy=true.
 */
export function equationToTileCounts(eq, opts = {}) {
  const { preferHeavy = true } = opts;
  const toks = tokenizeEquation(eq);
  if (!toks) throw new Error(`Cannot tokenize equation: ${eq}`);
  const counts = {};
  for (const tok of toks) {
    if (tok === '=' || OPS_ALL.includes(tok)) {
      inc(counts, tok, 1);
      continue;
    }
    const n = parseInt(tok, 10);
    if (Number.isNaN(n) || n < 0) throw new Error(`Unsupported number token: ${tok}`);
    const asHeavy = String(n);
    if (preferHeavy && HEAVY_SET.has(asHeavy)) {
      inc(counts, asHeavy, 1);
      continue;
    }
    for (const d of String(n).split('')) inc(counts, d, 1);
  }
  return counts;
}

/**
 * equationToSourceTiles(eq)
 *
 * Derive the ordered source tile list directly from a clean (wildcard-free)
 * equation string. Produces the same result as DFS for non-wildcard tile sets,
 * in O(n) time.  Returns string[] or null on error.
 */
export function equationToSourceTiles(eq) {
  const toks = tokenizeEquation(eq);
  if (!toks) return null;
  const tiles = [];
  for (const tok of toks) {
    if (tok === '=') { tiles.push('='); continue; }
    if (OPS_ALL.includes(tok)) { tiles.push(tok); continue; }
    const n = parseInt(tok, 10);
    if (Number.isNaN(n)) return null;
    if (HEAVY_SET.has(String(n))) {
      tiles.push(String(n));         // one heavy tile
    } else {
      for (const c of String(n)) tiles.push(c); // one tile per digit
    }
  }
  return tiles;
}

// ── Tile analysis ─────────────────────────────────────────────────────────────

export function analyzeTiles(tileList) {
  let ops = 0, heavy = 0, equals = 0, wilds = 0, blanks = 0;
  const opSpec = {};
  for (const t of tileList) {
    if (OPS_SET.has(t))   { ops++;  opSpec[t] = (opSpec[t] || 0) + 1; }
    if (HEAVY_SET.has(t)) heavy++;
    if (t === '=')        equals++;
    if (WILDS_SET.has(t)) wilds++;
    if (t === '?')        blanks++;
  }
  return { ops, heavy, equals, wilds, blanks, opSpec };
}

export function analyzeCounts(tileCounts) {
  const tileList = [];
  for (const [k, v] of Object.entries(tileCounts)) {
    for (let i = 0; i < v; i++) tileList.push(k);
  }
  return analyzeTiles(tileList);
}

export function satisfiesConfigFromCounts(tileCounts, cfg, requiredEquals) {
  const a = analyzeCounts(tileCounts);
  if (requiredEquals != null && a.equals !== requiredEquals) return false;
  if (!inRange(a.ops,   toRange(cfg.operatorCount)))  return false;
  if (!inRange(a.heavy, toRange(cfg.heavyCount)))      return false;
  if (!inRange(a.wilds, toRange(cfg.wildcardCount)))   return false;
  if (!inRange(a.blanks, toRange(cfg.blankCount)))     return false;
  if (cfg.operatorSpec) {
    for (const [op, constraint] of Object.entries(cfg.operatorSpec)) {
      if (!inRange(a.opSpec[op] || 0, toRange(constraint))) return false;
    }
  }
  return true;
}

export function withinPoolLimits(tileCounts, poolDef) {
  for (const [k, v] of Object.entries(tileCounts)) {
    if ((poolDef[k] ?? 0) < v) return false;
  }
  return true;
}

export function replaceOne(tileCounts, from, to) {
  if ((tileCounts[from] || 0) <= 0) return false;
  tileCounts[from]--;
  if (tileCounts[from] === 0) delete tileCounts[from];
  inc(tileCounts, to, 1);
  return true;
}
