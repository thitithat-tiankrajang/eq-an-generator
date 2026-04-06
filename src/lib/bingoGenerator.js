// ================================================================
//  A-MATH BINGO GENERATOR  v5
//
//  v3 pipeline:
//    random tiles → DFS find equation → retry
//
//  v5 pipeline:
//    Equation Constructor
//          ↓
//    Tile Composition Builder
//          ↓
//    Weighted Tile Expansion
//          ↓
//    DFS Validator (existing solver)
//          ↓
//    Board Layout Optimizer
//          ↓
//    Difficulty Analyzer
//
//  Note:
//  - The DFS solver is preserved and used strictly as a validator.
//  - The generator remains a single JS module runnable in Node/browser.
// ================================================================

// ─── Shared board constants (imported to avoid circular dependency) ───────────
import {
  OPS_SET        as _OPS_SET,
  WILDS_SET      as _WILDS_SET,
  HEAVY_SET      as _HEAVY_SET,
  DESCRIPTION_BOARD as _DESCRIPTION_BOARD,
} from './boardConstants.js';

// ─── Placement pipeline (popularity-aware cross-bingo placement) ──────────────
import {
  selectRealisticPlacement,
  selectLockPositions,
  passesRealismFilter,
} from './crossBingoPlacement.js';

// =================================================================
// SECTION 1 — CONSTANTS
// =================================================================

export const GENERATOR_VERSION = 'v5';

export const OPS_ALL = ['+','-','×','÷'];
export const OPS_SET = new Set(['+','-','×','÷','+/-','×/÷']);
export const WILDS_SET  = new Set(['?','+/-','×/÷']);
export const WILD_TILES = WILDS_SET; // alias for component use

export const LIGHT_DIGS = ['1','2','3','4','5','6','7','8','9'];
export const HEAVY_LIST = ['10','11','12','13','14','15','16','17','18','19','20'];
export const HEAVY_SET  = new Set(HEAVY_LIST);

// ── Tile point values (A-Math standard) ──────────────────────────────────────
export const TILE_POINTS = {
  '0':1, '1':1, '2':1, '3':1, '4':2, '5':2, '6':2, '7':2, '8':2, '9':2,
  '10':3,'11':4,'12':3,'13':6,'14':4,'15':4,'16':4,'17':6,'18':4,'19':7,'20':5,
  '+':2, '-':2, '×':2, '÷':2, '+/-':1, '×/÷':1, '=':1, '?':0,
};

// ── Description board 15×15 ───────────────────────────────────────────────────
// Symmetric layout inspired by A-Math scoring zones.
// px1=normal, px2=letter×2(orange), px3=letter×3(blue), px3star=letter×3+star(blue),
// ex2=word×2(yellow), ex3=word×3(red)
export const DESCRIPTION_BOARD = [
  ['ex3','px1','px1','px2','px1','px1','px1','ex3','px1','px1','px1','px2','px1','px1','ex3'],
  ['px1','ex2','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','ex2','px1'],
  ['px1','px1','ex2','px1','px1','px1','px2','px1','px2','px1','px1','px1','ex2','px1','px1'],
  ['px2','px1','px1','ex2','px1','px1','px1','px2','px1','px1','px1','ex2','px1','px1','px2'],
  ['px1','px1','px1','px1','px3','px1','px1','px1','px1','px1','px3','px1','px1','px1','px1'],
  ['px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1'],
  ['px1','px1','px2','px1','px1','px1','px2','px1','px2','px1','px1','px1','px2','px1','px1'],
  ['ex3','px1','px1','px2','px1','px1','px1','px3star','px1','px1','px1','px2','px1','px1','ex3'],
  ['px1','px1','px2','px1','px1','px1','px2','px1','px2','px1','px1','px1','px2','px1','px1'],
  ['px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','px3','px1'],
  ['px1','px1','px1','px1','px3','px1','px1','px1','px1','px1','px3','px1','px1','px1','px1'],
  ['px2','px1','px1','ex2','px1','px1','px1','px2','px1','px1','px1','ex2','px1','px1','px2'],
  ['px1','px1','ex2','px1','px1','px1','px2','px1','px2','px1','px1','px1','ex2','px1','px1'],
  ['px1','ex2','px1','px1','px1','px3','px1','px1','px1','px3','px1','px1','px1','ex2','px1'],
  ['ex3','px1','px1','px2','px1','px1','px1','ex3','px1','px1','px1','px2','px1','px1','ex3'],
];

// Resolve each source tile to its actual equation value (char-by-char scan).
// Returns string[] aligned 1-to-1 with solutionTiles.
function computeResolvedTiles(solutionTiles, equation) {
  const resolved = [...solutionTiles];
  let ci = 0; // char index in equation string

  for (let i = 0; i < solutionTiles.length && ci < equation.length; i++) {
    const src = solutionTiles[i];
    if (src === '=') {
      resolved[i] = '='; ci++;
    } else if (OPS_ALL.includes(src)) {
      resolved[i] = equation[ci]; ci++;
    } else if (src === '+/-' || src === '×/÷') {
      resolved[i] = equation[ci]; ci++;
    } else if (src === '?') {
      const ch = equation[ci];
      if (ch === '=' || OPS_ALL.includes(ch)) {
        resolved[i] = ch; ci++;
      } else {
        // Number — check if 2-digit heavy
        const two = equation.slice(ci, ci + 2);
        if (HEAVY_SET.has(two)) { resolved[i] = two; ci += 2; }
        else { resolved[i] = ch; ci++; }
      }
    } else if (HEAVY_SET.has(src)) {
      // Heavy tile occupies 2 chars in the equation string
      resolved[i] = equation.slice(ci, ci + 2); ci += 2;
    } else {
      // Regular digit tile
      resolved[i] = equation[ci]; ci++;
    }
  }
  return resolved;
}

const BOARD_SIZE = 15;
const BOARD_COLS = 5;
const BOARD_ROWS = 3;
const RACK_SIZE = 8;

const RESULT_MIN = 0;
const RESULT_MAX = 200;

// =================================================================
// SECTION 2 — TILE POOL
// =================================================================

// Pool Definition (tile availability)
export const POOL_DEF = {
  '0':0, '1':4, '2':4, '3':4, '4':4, '5':4, '6':4, '7':4, '8':4, '9':4,
  '10':1,'11':1,'12':1,'13':1,'14':1,'15':1,'16':1,'17':1,'18':1,'19':1,'20':1,
  '+':4, '-':4, '×':4, '÷':4, '+/-':4, '×/÷':4, '=':8, '?':2,
};

// Keep v3 function name for backward compatibility
function makeCounts(poolDef = POOL_DEF) {
  return Object.fromEntries(Object.entries(poolDef).map(([k,v]) => [k,v]));
}

// =================================================================
// SECTION 3 — EQUATION CONSTRUCTOR
// =================================================================

function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }
function toRange(v) { if (v == null) return null; return typeof v === 'number' ? [v, v] : v; }
function inRange(val, range) { if (!range) return true; return val >= range[0] && val <= range[1]; }

function sumCounts(counts) {
  let s = 0;
  for (const v of Object.values(counts)) s += v;
  return s;
}

function inc(counts, k, n = 1) { counts[k] = (counts[k] || 0) + n; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = 0 | (Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * applyTileAssignmentToPlacement
 *
 * Adjusts slotProbs in placement so that selectLockPositions respects per-tile-type
 * lock/rack constraints from cfg.tileAssignmentSpec.
 *
 * tileAssignmentSpec keys:
 *   '<op>'      → specific operator ('+', '-', '×', '÷', '+/-', '×/÷')
 *   '?'         → blank tile
 *   '__heavy__' → any heavy tile (10–20)
 *
 * For each key with { locked, onRack }:
 *   - Tile indices of that type are shuffled, then the first `locked` get slotProbs=2
 *     (≥1 = mustLock in selectLockPositions) and the rest get slotProbs=0 (excluded).
 *
 * Exported for testing.
 */
export function applyTileAssignmentToPlacement(solutionTiles, placement, tileAssignmentSpec) {
  if (!tileAssignmentSpec || Object.keys(tileAssignmentSpec).length === 0) return placement;

  const catOf = (tile) => HEAVY_SET.has(tile) ? '__heavy__' : tile;

  // Group tile indices by category
  const byType = {};
  solutionTiles.forEach((tile, i) => {
    const cat = catOf(tile);
    if (!byType[cat]) byType[cat] = [];
    byType[cat].push(i);
  });

  const slotProbs = [...(placement.slotProbs ?? Array(solutionTiles.length).fill(1 / solutionTiles.length))];

  for (const [typeKey, spec] of Object.entries(tileAssignmentSpec)) {
    const indices = shuffle([...(byType[typeKey] || [])]);
    if (!indices.length) continue;

    const total = indices.length;
    let lockedN = null;
    const safeInt = (v) => (Number.isFinite(v) ? Math.round(v) : null);
    const lockedVal  = safeInt(spec.locked);
    const onRackVal  = safeInt(spec.onRack);

    if (lockedVal != null && onRackVal != null) {
      // Both specified: locked takes priority, onRack is informational
      lockedN = Math.min(lockedVal, total);
    } else if (lockedVal != null) {
      lockedN = Math.min(lockedVal, total);
    } else if (onRackVal != null) {
      lockedN = Math.max(0, total - Math.min(onRackVal, total));
    }

    if (lockedN !== null) {
      indices.slice(0, lockedN).forEach(i => { slotProbs[i] = 2; });   // mustLock
      indices.slice(lockedN).forEach(i => { slotProbs[i] = 0; });      // excluded → rack
    }
  }

  return { ...placement, slotProbs };
}

function weightedSample(items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Integer arithmetic with operator precedence (× ÷ before + −).
// Returns null if expression is invalid or yields non-integer result.
function evalExpr(expr) {
  const toks = expr.match(/\d+|[+×÷-]/g);
  if (!toks || toks.length === 0) return null;
  if (toks.length % 2 === 0) return null; // must be num (op num)...

  const nums = [];
  const ops = [];
  for (let i = 0; i < toks.length; i++) {
    if (i % 2 === 0) {
      const n = parseInt(toks[i], 10);
      if (Number.isNaN(n)) return null;
      nums.push(n);
    } else {
      const op = toks[i];
      if (!OPS_ALL.includes(op)) return null;
      ops.push(op);
    }
  }
  if (ops.length !== nums.length - 1) return null;

  // First pass: × and ÷
  const pNums = [nums[0]];
  const pOps = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const right = nums[i + 1];
    if (op === '×' || op === '÷') {
      const left = pNums[pNums.length - 1];
      if (op === '×') {
        pNums[pNums.length - 1] = left * right;
      } else {
        if (right === 0) return null;
        if (left % right !== 0) return null;
        pNums[pNums.length - 1] = left / right;
      }
    } else {
      pOps.push(op);
      pNums.push(right);
    }
  }

  // Second pass: + and -
  let v = pNums[0];
  for (let i = 0; i < pOps.length; i++) {
    const op = pOps[i];
    const r = pNums[i + 1];
    if (op === '+') v += r;
    else if (op === '-') v -= r;
    else return null;
  }
  return v;
}

// ─── Rational arithmetic helpers (for player validation) ─────────────────────
function _gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}
function _frac(n, d) {
  if (d === 0) return null;
  if (d < 0) { n = -n; d = -d; }
  const g = _gcd(Math.abs(n), d);
  return { n: n / g, d: d / g };
}

// Like evalExpr but returns a reduced fraction {n,d} — allows non-integer division.
function evalExprRational(expr) {
  const toks = expr.match(/\d+|[+×÷-]/g);
  if (!toks || toks.length === 0) return null;
  if (toks.length % 2 === 0) return null;

  const nums = [];
  const ops = [];
  for (let i = 0; i < toks.length; i++) {
    if (i % 2 === 0) {
      const n = parseInt(toks[i], 10);
      if (Number.isNaN(n)) return null;
      nums.push(_frac(n, 1));
    } else {
      const op = toks[i];
      if (!OPS_ALL.includes(op)) return null;
      ops.push(op);
    }
  }
  if (ops.length !== nums.length - 1) return null;

  // First pass: × and ÷
  const pNums = [nums[0]];
  const pOps = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const right = nums[i + 1];
    const left = pNums[pNums.length - 1];
    if (op === '×') {
      const r = _frac(left.n * right.n, left.d * right.d);
      if (!r) return null;
      pNums[pNums.length - 1] = r;
    } else if (op === '÷') {
      if (right.n === 0) return null;
      const r = _frac(left.n * right.d, left.d * right.n);
      if (!r) return null;
      pNums[pNums.length - 1] = r;
    } else {
      pOps.push(op);
      pNums.push(right);
    }
  }

  // Second pass: + and -
  let v = pNums[0];
  for (let i = 0; i < pOps.length; i++) {
    const op = pOps[i];
    const r = pNums[i + 1];
    if (op === '+') v = _frac(v.n * r.d + r.n * v.d, v.d * r.d);
    else if (op === '-') v = _frac(v.n * r.d - r.n * v.d, v.d * r.d);
    else return null;
    if (!v) return null;
  }
  return v;
}

function isValidEquation(eq, requiredEquals, checkRange = true) {
  const parts = eq.split('=');
  if (parts.length - 1 !== requiredEquals) return false;
  if (parts.some(p => p.length === 0)) return false;

  if (checkRange) {
    // Generator mode: integer results only, within RESULT_MIN..RESULT_MAX
    const vals = parts.map(evalExpr);
    if (vals.some(v => v === null)) return false;
    if (!vals.every(v => v >= RESULT_MIN && v <= RESULT_MAX)) return false;
    return vals.every(v => v === vals[0]);
  } else {
    // Player mode: allow rational results, no range constraint
    const vals = parts.map(evalExprRational);
    if (vals.some(v => v === null)) return false;
    return vals.every(v => v.n === vals[0].n && v.d === vals[0].d);
  }
}

// Splits "3×4=12" into ['3','×','4','=','12']
function tokenizeEquation(eq) {
  const toks = eq.match(/\d+|[+×÷=-]/g);
  return toks || null;
}

function randInt(lo, hi) {
  return lo + (0 | (Math.random() * (hi - lo + 1)));
}

function pickOpWeighted() {
  // Bias toward +/× because they tend to keep numbers non-negative and integer-safe.
  const ops = ['+','-','×','÷'];
  const w = [5, 2, 5, 2];
  return weightedSample(ops, w);
}

function safeApplyOp(a, op, b) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '×') return a * b;
  if (op === '÷') {
    if (b === 0) return null;
    if (a % b !== 0) return null;
    return a / b;
  }
  return null;
}

function safeEvalL2R(nums, ops) {
  let v = nums[0];
  for (let i = 0; i < ops.length; i++) {
    const next = safeApplyOp(v, ops[i], nums[i + 1]);
    if (next === null) return null;
    v = next;
  }
  return v;
}

/**
 * constructEquation(eqCount)
 *
 * Create a valid A-Math equation string with exactly eqCount '=' signs.
 * Constraints:
 * - integer arithmetic (division must be exact)
 * - results between 0 and 200 (inclusive)
 *
 * Important: The DFS validator uses left-to-right evaluation, so constructor does too.
 */
function constructEquation(eqCount, opts = {}) {
  const { targetTiles = null } = opts;
  const MAX_TRIES = targetTiles == null ? 2500 : 15000;

  const tileCountOfEquation = (eq) => {
    const toks = tokenizeEquation(eq);
    if (!toks) return Infinity;
    let count = 0;
    for (const tok of toks) {
      if (tok === '=' || OPS_ALL.includes(tok)) { count += 1; continue; }
      const n = parseInt(tok, 10);
      if (Number.isNaN(n) || n < 0) return Infinity;
      const asHeavy = String(n);
      if (HEAVY_SET.has(asHeavy)) { count += 1; continue; }
      count += String(n).length;
    }
    return count;
  };

  const accept = (eq) => isValidEquation(eq, eqCount) && (targetTiles == null || tileCountOfEquation(eq) === targetTiles);

  for (let t = 0; t < MAX_TRIES; t++) {
    // Fast-path for target tile budgets:
    // Prefer equations composed mostly of HEAVY tiles (10–20) + explicit operators.
    // This dramatically reduces DFS branching compared to many digit tiles.
    if (targetTiles != null) {
      if (eqCount === 1) {
        // Form: n1 op n2 op ... op nm = R
        // Prefer all-heavy numbers with +/- so RHS is also a heavy tile.
        // Tokens (single-tile numbers): m nums + (m-1) ops + '=' + R => 2m + 1
        const m = Math.max(2, ((targetTiles - 1) / 2) | 0);
        if (2 * m + 1 === targetTiles) {
          // Deterministic low-entropy construction when possible:
          // If (m-1) is even, we can cancel with +A -A pairs to force the result to stay R.
          // Example (m=5): R + A - A + A - A = R
          if (((m - 1) % 2) === 0) {
            // Use single digits (1–9) so pool can support repeats (4 copies each).
            const R = randInt(1, 9);
            const pairCount = (m - 1) / 2;
            const ds = shuffle(LIGHT_DIGS.map(x => parseInt(x, 10))).filter(x => x !== R).slice(0, pairCount);
            if (ds.length === pairCount) {
              const nums = [R];
              const ops = [];
              for (const d of ds) {
                nums.push(d, d);
                ops.push('+', '-');
              }
              const eq = `${nums[0]}${ops.map((op, i) => `${op}${nums[i + 1]}`).join('')}=${R}`;
              if (accept(eq)) return eq;
            }
          }

          const nums = Array.from({ length: m }, () => parseInt(HEAVY_LIST[randInt(0, HEAVY_LIST.length - 1)], 10));
          const ops = Array.from({ length: m - 1 }, () => (Math.random() < 0.55 ? '+' : '-'));
          const v = safeEvalL2R(nums, ops);
          if (v == null || v < RESULT_MIN || v > RESULT_MAX) continue;
          if (!HEAVY_SET.has(String(v))) continue; // keep RHS as 1 tile
          const eq = `${nums[0]}${ops.map((op, i) => `${op}${nums[i + 1]}`).join('')}=${v}`;
          if (accept(eq)) return eq;
        }
      }

      if (eqCount === 2) {
        // Form: n1 op ... op nm = R = R  (R heavy => single-tile)
        // Tokens: (2m-1) + 2 '=' + 2 results => 2m + 3
        const m = Math.max(2, ((targetTiles - 3) / 2) | 0);
        if (2 * m + 3 === targetTiles) {
          if (((m - 1) % 2) === 0) {
            const R = randInt(1, 9);
            const pairCount = (m - 1) / 2;
            const ds = shuffle(LIGHT_DIGS.map(x => parseInt(x, 10))).filter(x => x !== R).slice(0, pairCount);
            if (ds.length === pairCount) {
              const nums = [R];
              const ops = [];
              for (const d of ds) {
                nums.push(d, d);
                ops.push('+', '-');
              }
              const eq = `${nums[0]}${ops.map((op, i) => `${op}${nums[i + 1]}`).join('')}=${R}=${R}`;
              if (accept(eq)) return eq;
            }
          }

          const nums = Array.from({ length: m }, () => parseInt(HEAVY_LIST[randInt(0, HEAVY_LIST.length - 1)], 10));
          const ops = Array.from({ length: m - 1 }, () => (Math.random() < 0.55 ? '+' : '-'));
          const v = safeEvalL2R(nums, ops);
          if (v == null || v < RESULT_MIN || v > RESULT_MAX) continue;
          if (!HEAVY_SET.has(String(v))) continue;
          const eq = `${nums[0]}${ops.map((op, i) => `${op}${nums[i + 1]}`).join('')}=${v}=${v}`;
          if (accept(eq)) return eq;
        }
      }
    }

    if (eqCount === 1) {
      const kind = weightedSample(
        ['bin', 'tri', 'twoSide'],
        [3, 6, 5]
      );

      if (kind === 'bin') {
        // a op b = c
        const a = randInt(0, 20);
        const b = randInt(0, 20);
        const op = pickOpWeighted();
        const c = safeApplyOp(a, op, b);
        if (c === null || c < RESULT_MIN || c > RESULT_MAX) continue;
        const eq = `${a}${op}${b}=${c}`;
        if (accept(eq)) return eq;
      }

      if (kind === 'tri') {
        // a op b op c = d  (left-to-right)
        const a = randInt(0, 20);
        const b = randInt(0, 20);
        const c = randInt(0, 20);
        const op1 = pickOpWeighted();
        const op2 = pickOpWeighted();
        const d = safeEvalL2R([a, b, c], [op1, op2]);
        if (d === null || d < RESULT_MIN || d > RESULT_MAX) continue;
        const eq = `${a}${op1}${b}${op2}${c}=${d}`;
        if (accept(eq)) return eq;
      }

      if (kind === 'twoSide') {
        // a op b = c op d  (left-to-right on each side)
        const a = randInt(0, 20);
        const b = randInt(0, 20);
        const c = randInt(0, 20);
        const d = randInt(0, 20);
        const opL = pickOpWeighted();
        const opR = pickOpWeighted();
        const lv = safeEvalL2R([a, b], [opL]);
        const rv = safeEvalL2R([c, d], [opR]);
        if (lv === null || rv === null) continue;
        if (lv !== rv) continue;
        if (lv < RESULT_MIN || lv > RESULT_MAX) continue;
        const eq = `${a}${opL}${b}=${c}${opR}${d}`;
        if (accept(eq)) return eq;
      }
    }

    if (eqCount === 2) {
      const kind = weightedSample(
        ['chain', 'twoOpsChain'],
        [6, 4]
      );

      if (kind === 'chain') {
        // a op b = c = d
        const a = randInt(0, 20);
        const b = randInt(0, 20);
        const op = pickOpWeighted();
        const v = safeApplyOp(a, op, b);
        if (v === null || v < RESULT_MIN || v > RESULT_MAX) continue;
        const eq = `${a}${op}${b}=${v}=${v}`;
        if (accept(eq)) return eq;
      }

      if (kind === 'twoOpsChain') {
        // a op b = c op d = v
        const c = randInt(0, 20);
        const d = randInt(0, 20);
        const opR = pickOpWeighted();
        const v = safeEvalL2R([c, d], [opR]);
        if (v === null || v < RESULT_MIN || v > RESULT_MAX) continue;

        // Now choose a, b, opL such that a opL b == v
        const opL = pickOpWeighted();
        let a = randInt(0, 20);
        let b = randInt(0, 20);

        // Try to synthesize more directly for ÷ and ×
        if (opL === '÷') {
          b = randInt(1, 20);
          a = v * b;
          if (a > 200) continue;
        } else if (opL === '×') {
          b = randInt(0, 20);
          a = b === 0 ? 0 : (v % b === 0 ? v / b : randInt(0, 20));
        } else if (opL === '+') {
          b = randInt(0, 20);
          a = v - b;
        } else if (opL === '-') {
          b = randInt(0, 20);
          a = v + b;
        }

        if (a < 0 || a > 200 || b < 0 || b > 20) continue;
        const lv = safeEvalL2R([a, b], [opL]);
        if (lv !== v) continue;
        const eq = `${a}${opL}${b}=${c}${opR}${d}=${v}`;
        if (accept(eq)) return eq;
      }
    }
  }

  // Fallback (should be very rare)
  return eqCount === 2 ? '12÷4=3=3' : '3×4=12';
}

/**
 * equationToTileCounts(eq)
 *
 * Convert an equation string into a multiset of tiles required to represent it.
 * - numbers 10–20 prefer heavy tiles when possible (1 tile)
 * - other numbers use digit tiles per character
 * - operators and '=' map directly
 */
function equationToTileCounts(eq, opts = {}) {
  const { preferHeavy = true } = opts;
  const toks = tokenizeEquation(eq);
  if (!toks) throw new Error(`Cannot tokenize equation: ${eq}`);
  const counts = {};
  for (const tok of toks) {
    if (tok === '=' || OPS_ALL.includes(tok)) {
      inc(counts, tok, 1);
      continue;
    }
    // number token
    const n = parseInt(tok, 10);
    if (Number.isNaN(n) || n < 0) throw new Error(`Unsupported number token: ${tok}`);
    const asHeavy = String(n);
    if (preferHeavy && HEAVY_SET.has(asHeavy)) {
      inc(counts, asHeavy, 1);
      continue;
    }
    const digits = String(n).split('');
    for (const d of digits) inc(counts, d, 1);
  }
  return counts;
}

// =================================================================
// SECTION 4 — TILE BUILDERS
// =================================================================

function analyzeTiles(tileList) {
  let ops = 0, heavy = 0, equals = 0, wilds = 0, blanks = 0;
  const opSpec = {};
  for (const t of tileList) {
    if (OPS_SET.has(t)) { ops++; opSpec[t] = (opSpec[t] || 0) + 1; }
    if (HEAVY_SET.has(t)) heavy++;
    if (t === '=') equals++;
    if (WILDS_SET.has(t)) wilds++;
    if (t === '?') blanks++;
  }
  return { ops, heavy, equals, wilds, blanks, opSpec };
}

function analyzeCounts(tileCounts) {
  const tileList = [];
  for (const [k, v] of Object.entries(tileCounts)) {
    for (let i = 0; i < v; i++) tileList.push(k);
  }
  return analyzeTiles(tileList);
}

function satisfiesConfigFromCounts(tileCounts, cfg, requiredEquals) {
  const a = analyzeCounts(tileCounts);
  if (requiredEquals != null && a.equals !== requiredEquals) return false;
  if (!inRange(a.ops, toRange(cfg.operatorCount))) return false;
  if (!inRange(a.heavy, toRange(cfg.heavyCount))) return false;
  if (!inRange(a.wilds, toRange(cfg.wildcardCount))) return false;
  if (!inRange(a.blanks, toRange(cfg.blankCount))) return false;
  if (cfg.operatorSpec) {
    for (const [op, constraint] of Object.entries(cfg.operatorSpec)) {
      if (!inRange(a.opSpec[op] || 0, toRange(constraint))) return false;
    }
  }
  return true;
}

function withinPoolLimits(tileCounts, poolDef = POOL_DEF) {
  for (const [k, v] of Object.entries(tileCounts)) {
    if ((poolDef[k] ?? 0) < v) return false;
  }
  return true;
}

function replaceOne(tileCounts, from, to) {
  if ((tileCounts[from] || 0) <= 0) return false;
  tileCounts[from]--;
  if (tileCounts[from] === 0) delete tileCounts[from];
  inc(tileCounts, to, 1);
  return true;
}

function _flexifyTileCounts(tileCounts, cfg, eqCount, poolDef = POOL_DEF) {
  // Weighted tile expansion without changing total tile budget:
  // replace some specific tiles with flexible equivalents ('?', '+/-', '×/÷').
  // This preserves solvability because the original seed equation can still be formed
  // by choosing appropriate substitutions during DFS.
  // blankCount controls only '?' tiles; wildcardCount controls all wilds
  const blankRange = toRange(cfg.blankCount);
  const wildRange  = toRange(cfg.wildcardCount);
  if (!blankRange && !wildRange) return { ...tileCounts };

  // Use blankRange if set, otherwise fall back to wildRange
  const activeRange = blankRange ?? wildRange;
  const minWild = activeRange[0];
  const maxWild = activeRange[1];
  const targetWild = clamp(
    minWild + (0 | (Math.random() * (Math.max(0, maxWild - minWild) + 1))),
    minWild,
    maxWild
  );

  const counts = { ...tileCounts };
  const pool = makeCounts(poolDef);
  for (const [k, v] of Object.entries(counts)) pool[k] -= v;
  const canAdd = (t) => (pool[t] || 0) > 0;

  // Make sure we keep real '=' tiles (avoid replacing them with '?')
  // because '=' is always fixed on the board.

  // Step A: satisfy wildcard minimum (prefer replacing number tiles with '?')
  let guard = 0;
  while (analyzeCounts(counts).wilds < targetWild && guard++ < 200) {
    if (!canAdd('?')) break;
    const choices = [];
    // Only replace tiles that '?' can safely stand in for during DFS:
    // - any single digit (1–9)
    // - heavy 10/12 (DFS has a special-case for '?' → 10 or 12)
    for (const d of LIGHT_DIGS) if ((counts[d] || 0) > 0) choices.push(d);
    for (const h of ['10', '12']) if ((counts[h] || 0) > 0) choices.push(h);
    if (!choices.length) break;
    const from = choices[0 | (Math.random() * choices.length)];
    replaceOne(counts, from, '?');
    pool['?']--;
    pool[from]++; // freed up
    if (!withinPoolLimits(counts, poolDef)) break;
  }

  // Step B: optional operator flex (only if still under wildcard target)
  const tryReplaceOp = (from, to) => {
    if (!canAdd(to)) return false;
    if (!replaceOne(counts, from, to)) return false;
    if (!withinPoolLimits(counts, poolDef)) { replaceOne(counts, to, from); return false; }
    if (!satisfiesConfigFromCounts(counts, cfg, eqCount)) { replaceOne(counts, to, from); return false; }
    pool[to]--; pool[from]++;
    return true;
  };

  guard = 0;
  while (analyzeCounts(counts).wilds < targetWild && guard++ < 50) {
    const ops = [];
    if ((counts['+'] || 0) > 0) ops.push(['+', '+/-']);
    if ((counts['-'] || 0) > 0) ops.push(['-', '+/-']);
    if ((counts['×'] || 0) > 0) ops.push(['×', '×/÷']);
    if ((counts['÷'] || 0) > 0) ops.push(['÷', '×/÷']);
    if (!ops.length) break;
    const [from, to] = ops[0 | (Math.random() * ops.length)];
    if (!tryReplaceOp(from, to)) break;
  }

  return counts;
}

function pickIntInRange(range, fallbackLo, fallbackHi) {
  const r = toRange(range);
  const rawLo = r ? r[0] : fallbackLo;
  const rawHi = r ? r[1] : fallbackHi;
  // Guard against NaN (e.g. from UI state that got corrupted)
  const lo = (Number.isFinite(rawLo)) ? rawLo : fallbackLo;
  const hi = (Number.isFinite(rawHi)) ? rawHi : fallbackHi;
  if (hi < lo) return lo;
  return randInt(lo, hi);
}

function buildTileCountsBasedOnConfig(totalTile, cfg, eqCount, poolDef = POOL_DEF) {
  // This mirrors the idea in `equationAnagramLogic.ts`:
  // - sample exact counts from the *true pool*
  // - respect config constraints as hard bounds
  // - only then validate solvability (DFS validator)
  const pool = makeCounts(poolDef);
  const counts = {};

  const takeFromPool = (t) => {
    if ((pool[t] || 0) <= 0) return false;
    pool[t]--;
    inc(counts, t, 1);
    return true;
  };

  // 1) Equals (must be real '=' tiles so '=' can be locked on board)
  for (let i = 0; i < eqCount; i++) {
    if (!takeFromPool('=')) return null;
  }

  // 2) Choose target totals (hard constraints)
  const opTarget    = pickIntInRange(cfg.operatorCount, 2, Math.min(6, totalTile - eqCount - 2));
  const heavyTarget = pickIntInRange(cfg.heavyCount,    0, Math.min(3, totalTile - eqCount - 3));
  const wildTarget  = pickIntInRange(cfg.wildcardCount, 0, Math.min(2, totalTile - eqCount - 3));
  // blankCount controls only '?' tiles (separate from +/- and ×/÷)
  const blankTarget = pickIntInRange(cfg.blankCount,    0, Math.min(2, totalTile - eqCount - 3));

  // 3) Operators: respect operatorSpec first (min), then fill to opTarget
  const opsAll = ['+','-','×','÷','+/-','×/÷'];
  const opSpec = cfg.operatorSpec || null;

  if (opSpec) {
    for (const op of opsAll) {
      const rr = toRange(opSpec[op]);
      const min = rr ? rr[0] : 0;
      for (let i = 0; i < min; i++) {
        if (!takeFromPool(op)) return null;
      }
    }
  }

  const currentOps = () => analyzeCounts(counts).ops;
  while (currentOps() < opTarget) {
    // Pick an operator that does not exceed operatorSpec max (if provided)
    const cand = [];
    for (const op of opsAll) {
      if ((pool[op] || 0) <= 0) continue;
      const rr = opSpec ? toRange(opSpec[op]) : null;
      if (rr) {
        const curr = counts[op] || 0;
        if (curr >= rr[1]) continue;
      }
      cand.push(op);
    }
    if (!cand.length) return null;
    // Weight toward core ops, not choice ops
    const op = weightedSample(cand, cand.map(o => (o === '+/-' || o === '×/÷' ? 2 : 5)));
    if (!takeFromPool(op)) return null;
  }

  // 4) Heavy numbers
  while ((analyzeCounts(counts).heavy) < heavyTarget) {
    const heavyAvail = HEAVY_LIST.filter(h => (pool[h] || 0) > 0);
    if (!heavyAvail.length) return null;
    const h = weightedSample(heavyAvail, heavyAvail.map(x => pool[x]));
    if (!takeFromPool(h)) return null;
  }

  // 5a) blankCount — only '?' tiles
  while ((analyzeCounts(counts).blanks) < blankTarget) {
    if ((pool['?'] || 0) <= 0) break;
    if (!takeFromPool('?')) return null;
  }

  // 5b) Wildcards (count includes '?', '+/-', '×/÷')
  // Prefer '?' first to meet wildcardCount if requested (but don't overdo).
  while (analyzeCounts(counts).wilds < wildTarget) {
    if ((pool['?'] || 0) > 0) {
      if (!takeFromPool('?')) return null;
    } else if ((pool['+/-'] || 0) > 0) {
      if (!takeFromPool('+/-')) return null;
    } else if ((pool['×/÷'] || 0) > 0) {
      if (!takeFromPool('×/÷')) return null;
    } else {
      return null;
    }
  }

  // 6) Fill remaining with light digits (pool-aware)
  while (sumCounts(counts) < totalTile) {
    const digits = LIGHT_DIGS.filter(d => (pool[d] || 0) > 0);
    if (!digits.length) return null;
    const d = weightedSample(digits, digits.map(x => pool[x]));
    if (!takeFromPool(d)) return null;
  }

  if (sumCounts(counts) !== totalTile) return null;
  if (!withinPoolLimits(counts, poolDef)) return null;
  if (!satisfiesConfigFromCounts(counts, cfg, eqCount)) return null;

  // Ensure no '=' ends up in rack by construction (we only used '=' tiles).
  return counts;
}

/**
 * hybridTileBuilder(totalTile, cfg, eqCount)
 *
 * v5 (anagram-style) tile builder:
 * - build tileCounts from the real pool to satisfy config first
 * - then rely on the DFS validator to confirm solvability
 *
 * Returns { tileCounts, seedEquation } or null.
 */
function hybridTileBuilder(totalTile, cfg, eqCount, poolDef = POOL_DEF) {
  const MAX_BUILDER_TRIES = 2500;

  for (let attempt = 0; attempt < MAX_BUILDER_TRIES; attempt++) {
    const tileCounts = buildTileCountsBasedOnConfig(totalTile, cfg, eqCount, poolDef);
    if (!tileCounts) continue;
    // seedEquation is now only informational (we construct via DFS)
    return { tileCounts, seedEquation: null };
  }

  return null;
}

// =================================================================
// SECTION 5 — DFS SOLVER (existing)
// =================================================================

/**
 * findEquationsFromTiles(tileCounts, requiredEquals, maxResults)
 *
 * Preserved from v3.
 * Given an exact multiset of tiles (tileCounts), find equations that:
 * 1. Use ALL tiles exactly
 * 2. Contain exactly `requiredEquals` '=' signs
 * 3. Are arithmetically valid (integer arithmetic with × ÷ precedence)
 *
 * Returns array of { eq: string, tiles: string[] }
 * where `tiles` is the ordered list of source tiles used (matching equation token order).
 */
function findEquationsFromTiles(tileCounts, requiredEquals, maxResults = 1) {
  const results = [];
  const eqParts = [];   // string tokens forming the equation
  const srcTiles = [];  // parallel: source tile for each eqPart

  function rem() {
    let s = 0;
    for (const v of Object.values(tileCounts)) s += v;
    return s;
  }
  function take(t) { tileCounts[t]--; }
  function put(t) { tileCounts[t]++; }

  // Try to place a number, then call onComplete() for each valid placement.
  function buildNum(onComplete, zeroOk) {
    if (results.length >= maxResults) return;

    // Heavy tiles (10–20) – single tile, standalone number
    for (const h of HEAVY_LIST) {
      if ((tileCounts[h] || 0) > 0) {
        take(h);
        eqParts.push(h); srcTiles.push(h);
        onComplete();
        eqParts.pop(); srcTiles.pop();
        put(h);
        if (results.length >= maxResults) return;
      }
    }

    // '?' used as heavy number (10 or 12)
    if ((tileCounts['?'] || 0) > 0) {
      for (const h of ['10', '12']) {
        take('?');
        eqParts.push(h); srcTiles.push('?');
        onComplete();
        eqParts.pop(); srcTiles.pop();
        put('?');
        if (results.length >= maxResults) return;
      }
    }

    // Zero (standalone '0') — only when allowed
    if (zeroOk) {
      for (const src of ['0', '?']) {
        if ((tileCounts[src] || 0) > 0) {
          take(src);
          eqParts.push('0'); srcTiles.push(src);
          onComplete();
          eqParts.pop(); srcTiles.pop();
          put(src);
          if (results.length >= maxResults) return;
        }
      }
    }

    // Compose 1–3 light digits into a number (e.g., '3','7' → "37")
    const digitOrder = shuffle(LIGHT_DIGS);

    function composeDigits(built, builtSrcs) {
      if (results.length >= maxResults) return;
      if (built.length > 0) {
        eqParts.push(built);
        srcTiles.push(...builtSrcs);
        onComplete();
        // pop: 1 eqPart, N srcTiles
        eqParts.pop();
        for (let i = 0; i < builtSrcs.length; i++) srcTiles.pop();
      }
      if (built.length >= 3) return;
      for (const d of digitOrder) {
        for (const src of [d, '?']) {
          if ((tileCounts[src] || 0) > 0) {
            take(src);
            composeDigits(built + d, [...builtSrcs, src]);
            put(src);
            if (results.length >= maxResults) return;
          }
        }
      }
    }
    composeDigits('', []);
  }

  // Main DFS phases: 'num' = need a number next; 'op' = need an op/= next
  function dfs(phase, usedEq) {
    if (results.length >= maxResults) return;

    if (rem() === 0) {
      // All tiles consumed; valid if we ended after a number with right '=' count
      if (phase === 'op' && usedEq === requiredEquals) {
        const eq = eqParts.join('');
        if (isValidEquation(eq, requiredEquals)) results.push({ eq, tiles: [...srcTiles] });
      }
      return;
    }

    if (phase === 'num') {
      buildNum(() => dfs('op', usedEq), true);
      return;
    }

    // phase === 'op'
    // Place '='
    if (usedEq < requiredEquals) {
      for (const src of ['=', '?']) {
        if ((tileCounts[src] || 0) > 0) {
          take(src);
          eqParts.push('=');
          srcTiles.push(src);
          dfs('num', usedEq + 1);
          eqParts.pop(); srcTiles.pop();
          put(src);
          if (results.length >= maxResults) return;
        }
      }
    }

    // Place operator: try in shuffled order for diversity
    for (const op of shuffle(OPS_ALL)) {
      const srcs = [op];
      if (op === '+' || op === '-') srcs.push('+/-');
      if (op === '×' || op === '÷') srcs.push('×/÷');
      srcs.push('?');

      const tried = new Set();
      for (const src of srcs) {
        if (tried.has(src)) continue;
        tried.add(src);
        if ((tileCounts[src] || 0) > 0) {
          take(src);
          eqParts.push(op); srcTiles.push(src);
          dfs('num', usedEq);
          eqParts.pop(); srcTiles.pop();
          put(src);
          if (results.length >= maxResults) return;
        }
      }
    }
  }

  dfs('num', 0);
  return results;
}

// =================================================================
// SECTION 6 — BOARD GENERATOR
// =================================================================

/**
 * buildTilePerToken(equationTokens, orderedSourceTiles)
 *
 * Preserved behavior from v3: map DFS "source tiles" onto logical equation tokens.
 */
function buildTilePerToken(equationTokens, orderedSourceTiles) {
  const result = [];
  let si = 0;

  for (const tok of equationTokens) {
    if (si >= orderedSourceTiles.length) return null;

    if (tok === '=' || OPS_SET.has(tok)) {
      result.push({ token: tok, srcs: [orderedSourceTiles[si++]], src: orderedSourceTiles[si - 1] });
      continue;
    }

    // Numeric token — determine tile count from the SOURCE tile, not the token.
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

function eqPositionsFromTokens(tokens) {
  const pos = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i] === '=') pos.push(i);
  return pos;
}

function pickFixedIndicesHeuristic(equationTokens, tilePerToken, fixedCount) {
  // Must include all '=' token positions.
  const must = new Set(eqPositionsFromTokens(equationTokens));
  const remaining = fixedCount - must.size;
  if (remaining < 0) return null;
  if (remaining === 0) return [...must].sort((a, b) => a - b);

  // Candidates: exclude adjacent-to '=' to keep rack less constrained.
  const excluded = new Set(must);
  for (const p of must) { excluded.add(p - 1); excluded.add(p + 1); }

  const candidates = [];
  for (let i = 0; i < equationTokens.length; i++) {
    if (excluded.has(i)) continue;
    candidates.push(i);
  }

  // Score candidates: pin heavy numbers (and some ops) to avoid heavy flooding the rack.
  const isOpSrc = (src) => OPS_SET.has(src);
  const isHeavySrc = (src) => HEAVY_SET.has(src);

  const chosen = [];
  const blocked = new Set();

  const scoreIdx = (i) => {
    const src = tilePerToken[i]?.srcs?.[0];
    if (!src) return 0;
    if (src === '=') return 1000;
    let s = 0;
    if (isHeavySrc(src)) s += 40;
    if (isOpSrc(src)) s += 8;
    // Prefer keeping multi-digit numbers visible (they consume more rack tiles).
    if (!isOpSrc(src) && equationTokens[i] !== '=' && String(equationTokens[i]).length >= 2) s += 6;
    return s + Math.random(); // tie-break
  };

  // Greedy pick: each step choose best available not blocked.
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

function boardIndexToRowCol(idx) {
  return { r: (idx / BOARD_COLS) | 0, c: idx % BOARD_COLS };
}

function scorePlacement(space) {
  // Lower is better.
  let penalty = 0;

  // Penalize rows that have too many visible operators.
  for (let r = 0; r < BOARD_ROWS; r++) {
    let opCount = 0;
    let nonNull = 0;
    for (let c = 0; c < BOARD_COLS; c++) {
      const t = space[r * BOARD_COLS + c];
      if (t == null) continue;
      nonNull++;
      if (OPS_SET.has(t)) opCount++;
      if (t === '?') opCount += 0.4; // '?' often becomes an operator
    }
    if (nonNull === 0) continue;
    if (opCount >= 3) penalty += 8 * (opCount - 2);
    if (opCount === 2) penalty += 1.5;
  }

  // Penalize adjacent operators (including '=' somewhat).
  for (let i = 0; i < space.length; i++) {
    const t = space[i];
    if (t == null) continue;
    const { r, c } = boardIndexToRowCol(i);
    const neigh = [];
    if (c > 0) neigh.push(space[i - 1]);
    if (c < BOARD_COLS - 1) neigh.push(space[i + 1]);
    if (r > 0) neigh.push(space[i - BOARD_COLS]);
    if (r < BOARD_ROWS - 1) neigh.push(space[i + BOARD_COLS]);
    const isOpLike = (x) => x != null && (OPS_SET.has(x) || x === '=');
    if (isOpLike(t)) {
      const adj = neigh.filter(isOpLike).length;
      penalty += adj * 0.9;
    }
  }

  return penalty;
}

/**
 * optimizeBoardLayout(board)
 *
 * Choose equationStart (and keep fixedIndices) to balance visible tiles:
 * - spread equations across the 3x5 grid
 * - avoid rows with operator-heavy visibility
 */
function optimizeBoardLayout(board) {
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
    equationStart: best ? best.start : board.equationStart,
    space: best ? best.space : board.space,
    layoutScore: best ? best.score : undefined,
  };
}

/**
 * buildBoard(eq, orderedSourceTiles, cfg, meta)
 *
 * Construct the public board structure.
 */
function buildBoard(eq, orderedSourceTiles, cfg, meta) {
  const { mode, totalTile, eqCount } = meta;
  const fixedCount = totalTile - RACK_SIZE;

  const equationTokens = tokenizeEquation(eq);
  if (!equationTokens) return null;
  const tilePerToken = buildTilePerToken(equationTokens, orderedSourceTiles);
  if (!tilePerToken) return null;

  // Fixed indices selection (token indices)
  const fixedTokenIndices = pickFixedIndicesHeuristic(equationTokens, tilePerToken, fixedCount);
  if (!fixedTokenIndices) return null;

  const fixedTokenSet = new Set(fixedTokenIndices);

  // Build per-tile sequence (length = totalTile), each entry: { tokenIndex, tileIndexInToken, src }
  const tileSlots = [];
  tilePerToken.forEach((tt, ti) => {
    tt.srcs.forEach((src, k) => {
      tileSlots.push({ tokenIndex: ti, tileOffset: k, src });
    });
  });
  if (tileSlots.length !== totalTile) return null;

  // Decide which *tiles* are fixed: choose tiles whose tokenIndex in fixedTokenSet.
  const fixedTileIndices = [];
  for (let i = 0; i < tileSlots.length; i++) {
    if (fixedTokenSet.has(tileSlots[i].tokenIndex)) fixedTileIndices.push(i);
  }
  if (fixedTileIndices.length !== fixedCount) return null;

  // Rack = remaining tiles
  const fixedTileSet = new Set(fixedTileIndices);
  const rack = tileSlots
    .filter((_, i) => !fixedTileSet.has(i))
    .map(s => s.src);

  if (rack.some(t => t === '=')) return null;
  if (rack.length !== RACK_SIZE) return null;

  // Map from tile index back to “slot in equation” (0..totalTile-1)
  const maxStart = BOARD_SIZE - totalTile;
  const equationStart = 0 | (Math.random() * (maxStart + 1));
  const space = Array(BOARD_SIZE).fill(null);

  fixedTileIndices.forEach((ti) => {
    const boardPos = equationStart + ti;
    space[boardPos] = tileSlots[ti].src;
  });

  const baseBoard = {
    mode,
    space,
    equationStart,
    equation: eq,
    equationTokens: equationTokens.map((t, ti) => ({
      token: t,
      tokenIndex: ti,
    })),
    fixedIndices: fixedTileIndices, // now tile-slot indices (0..totalTile-1)
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

// =================================================================
// SECTION 7 — DIFFICULTY ANALYZER
// =================================================================

/**
 * scoreEquationDifficulty(eq)
 *
 * Returns 1–10 based on:
 * - operator complexity (÷ > × > − > +)
 * - number sizes (more digits / larger magnitudes)
 * - equation length / operation count
 */
function scoreEquationDifficulty(eq) {
  const toks = tokenizeEquation(eq) || [];
  let opScore = 0;
  let ops = 0;
  let digits = 0;
  let maxNum = 0;

  for (const tok of toks) {
    if (OPS_ALL.includes(tok)) {
      ops++;
      if (tok === '+') opScore += 1;
      else if (tok === '-') opScore += 2;
      else if (tok === '×') opScore += 3;
      else if (tok === '÷') opScore += 4;
    } else if (tok === '=') {
      opScore += 0.5;
    } else {
      const n = parseInt(tok, 10);
      if (!Number.isNaN(n)) {
        maxNum = Math.max(maxNum, n);
        digits += String(Math.abs(n)).length;
      }
    }
  }

  const len = toks.length;
  const sizeScore = Math.log10(maxNum + 1) * 3 + (digits >= 6 ? 2 : digits >= 4 ? 1 : 0);
  const complexity = opScore + ops * 0.8 + (len >= 11 ? 2 : len >= 9 ? 1 : 0) + sizeScore;

  // Map to 1–10 (tuned empirically to typical puzzle sizes)
  const raw = Math.round(1 + (complexity / 6.5) * 9);
  return clamp(raw, 1, 10);
}

// =================================================================
// SECTION 8 — PUBLIC API
// =================================================================

function resolveEqualCount(mode, cfg) {
  const range = toRange(cfg.equalCount);
  if (mode === 'cross') {
    if (range && (range[0] > 1 || range[1] < 1)) {
      throw new Error('Cross mode always has exactly 1 "=" in the equation.');
    }
    return 1;
  }
  // expand: 1 or 2; default 80% → 2
  if (!range) return Math.random() < 0.8 ? 2 : 1;
  const lo = clamp(range[0], 1, 2);
  const hi = clamp(range[1], 1, 2);
  if (lo === hi) return lo;
  return Math.random() < 0.75 ? 2 : 1;
}

function validateConfig(cfg) {
  const { mode, totalTile } = cfg;
  if (!['cross', 'expand', 'plain'].includes(mode)) throw new Error('mode must be "cross", "expand", or "plain"');
  if (mode === 'plain') {
    if (totalTile < 8 || totalTile > 15) throw new Error('Plain mode totalTile must be 8–15');
  } else {
    if (totalTile < 8 || totalTile > 15) throw new Error('totalTile must be 8–15');
  }
  if (mode === 'expand' && totalTile < 11) throw new Error('Expand mode requires totalTile ≥ 11');

  const eqRange = toRange(cfg.equalCount);
  if (eqRange) {
    const lo = clamp(eqRange[0], 1, 2);
    const hi = clamp(eqRange[1], 1, 2);
    if (mode === 'cross' && (lo > 1 || hi < 1)) throw new Error('Cross mode requires equalCount to include 1');
  }
}

// =================================================================
// SECTION 7 — REALISTIC BOARD PLACEMENT
// (selectRealisticPlacement, selectLockPositions, passesRealismFilter
//  are imported from crossBingoPlacement.js above)
// =================================================================

/**
 * generateBingo(cfg)
 *
 * v5 strategy:
 * - Construct a seed equation first (small, guaranteed-valid).
 * - Expand tile multiset with weighted flexible tiles (reduces DFS branching risk of "dead" tiles).
 * - Run DFS validator on the final tile multiset to ensure at least one complete solution exists.
 * - Build and optimize board layout (expand) or return cross-bingo board (cross).
 * - Score difficulty.
 */
export function generateBingo(cfg) {
  validateConfig(cfg);
  const { mode, totalTile } = cfg;

  const MAX_RETRIES = 180;
  const DFS_RESULTS_LIMIT = 1;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const eqCount = resolveEqualCount(mode, cfg);

    // Tile Composition Builder + Weighted Expansion
    // cfg.poolDef overrides the default tile pool (used when a custom tile set is selected)
    const built = hybridTileBuilder(totalTile, cfg, eqCount, cfg.poolDef ?? POOL_DEF);
    if (!built) continue;

    const { tileCounts, seedEquation } = built;

    // DFS Validator (existing solver) — find at least one complete solution.
    const found = findEquationsFromTiles({ ...tileCounts }, eqCount, DFS_RESULTS_LIMIT, { maxDigitLen: 3 });
    if (!found.length) continue;

    // Prefer a "cleaner" equation if multiple solutions exist:
    // - fewer '?' sources, fewer choice tiles, and moderate difficulty
    const ranked = [...found].sort((a, b) => {
      const ax = analyzeTiles(a.tiles);
      const bx = analyzeTiles(b.tiles);
      const aFlex = (a.tiles.filter(t => t === '?').length) + (a.tiles.filter(t => t === '+/-' || t === '×/÷').length);
      const bFlex = (b.tiles.filter(t => t === '?').length) + (b.tiles.filter(t => t === '+/-' || t === '×/÷').length);
      if (aFlex !== bFlex) return aFlex - bFlex;
      if (ax.ops !== bx.ops) return ax.ops - bx.ops;
      return a.eq.length - b.eq.length;
    });

    const chosen = ranked[0];
    const difficulty = scoreEquationDifficulty(chosen.eq);

    if (mode === 'plain') {
      const solutionTiles = chosen.tiles;
      const rackTiles = shuffle([...solutionTiles]);
      const boardSlots = solutionTiles.map(() => ({
        tile: null,
        isLocked: false,
        resolvedValue: null,
        slotType: 'px1',
      }));
      return {
        mode: 'plain',
        boardSlots,
        rackTiles,
        solutionTiles,
        equation: chosen.eq,
        totalTile,
        difficulty,
        generatorVersion: GENERATOR_VERSION,
        tileCounts,
      };
    }

    if (mode === 'cross') {
      const solutionTiles = chosen.tiles;
      const lockCount = Math.max(0, totalTile - RACK_SIZE);

      // Resolved values for each source tile (used by locked wild tiles for display)
      const resolvedTiles = computeResolvedTiles(solutionTiles, chosen.eq);

      // ── Placement pipeline (crossBingoPlacement.js) ──────────────────────────
      let placement, lockPositions;
      let tries = 0;
      do {
        placement = selectRealisticPlacement(totalTile);
        // Apply per-tile-type lock/rack constraints (from cfg.tileAssignmentSpec)
        const adjustedPlacement = applyTileAssignmentToPlacement(
          solutionTiles, placement, cfg.tileAssignmentSpec
        );
        lockPositions = selectLockPositions(totalTile, lockCount, adjustedPlacement);
        tries++;
      } while (
        !passesRealismFilter(placement)
        && tries < 10
      );

      const { cells } = placement;
      const lockSet   = new Set(lockPositions);

      // Build 15×15 board grid, placing each solution tile at its cell coordinate
      const board = Array.from({ length: 15 }, () => Array(15).fill(null));
      cells.forEach((cell, i) => {
        board[cell.r][cell.c] = solutionTiles[i];
      });

      const boardSlots = solutionTiles.map((tile, i) => ({
        tile:          lockSet.has(i) ? tile : null,
        isLocked:      lockSet.has(i),
        // For locked wild tiles: store the resolved value for display
        resolvedValue: lockSet.has(i) && WILDS_SET.has(tile) ? resolvedTiles[i] : null,
        slotType:      cells[i].type,
      }));

      const rackTiles = shuffle(solutionTiles.filter((_, i) => !lockSet.has(i)));

      return {
        mode: 'cross',
        board,
        boardSlots,
        placementRow: placement.rowIdx,
        placementCol: placement.colStart,
        placementDir: placement.dir,
        rackTiles,
        solutionTiles,
        equation: chosen.eq,
        totalTile,
        difficulty,
        generatorVersion: GENERATOR_VERSION,
        tileCounts,
      };
    }

    const board = buildBoard(chosen.eq, chosen.tiles, cfg, { mode, totalTile, eqCount });
    if (!board) continue;

    return {
      ...board,
      difficulty,
      generatorVersion: GENERATOR_VERSION,
      seedEquation,
      tileCounts,
    };
  }

  throw new Error(
    `Could not generate a valid bingo puzzle after ${MAX_RETRIES} attempts. ` +
    'Please check that your config constraints are satisfiable.'
  );
}

export function generateBingoBatch(cfg, count = 10) {
  return Array.from({ length: count }, () => generateBingo(cfg));
}

// Named exports for backward compatibility / external use (if any)
export {
  // existing
  findEquationsFromTiles,
  makeCounts,
  isValidEquation,
  // new v5 modules (requested)
  constructEquation,
  equationToTileCounts,
  hybridTileBuilder,
  scoreEquationDifficulty,
  optimizeBoardLayout,
  buildBoard,
};