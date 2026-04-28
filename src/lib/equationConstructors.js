// ================================================================
//  equationConstructors.js  (v7.2 — tight-budget negative fix)
//
//  Changes vs v7.1:
//  ─────────────────────────────────────────────────────────────
//  1. distributeTileBudget: lower bound relaxed from `total < nSlots`
//     to `total < Math.max(1, nSlots - 2)` so 8-tile / 3-op / 1-eq
//     configs (numBudget=4, nSlots=5) no longer return null.
//
//  2. constructEquationV6: same guard relaxed with -2 slack for
//     unary '-' tiles that don't consume operator budget.
//
//  3. tryBuildEq1Forward: when distributeTileBudget returns null
//     due to tight budget, falls through to tryBuildEq1Forward_tight
//     which forces a negative leading term so RHS fits in 2 tiles.
//
//  4. tryBuildEq1Forward_tight (new): dedicated builder for the
//     edge case where numBudget < KL+1.  Allocates (numBudget-2)
//     tiles to the LHS, forces result to be a negative single-digit
//     value so the RHS "-N" costs exactly 2 tiles.
//
//  5. tryBuildChainEq2 / tryBuildThreeWayEq2 tight-budget guards
//     also relaxed by -2 so chain equations work symmetrically.
// ================================================================

import {
  OPS_ALL, RESULT_MIN, RESULT_MAX,
  clamp, toRange, randInt, shuffle, weightedSample,
  evalExpr, evalExprRational, isValidEquation,
} from './bingoMath.js';

import {
  numTiles, equationToTileCounts, sumCounts, withinPoolLimits,
} from './tileHelpers.js';

// ── Pool context for the current constructEquationV6 call ─────────────────────
// Set at the start of each constructEquationV6 call so that pickNumForBudget
// can generate digit values that are actually available in the tile bag.
// Single-threaded JS: no concurrency risk; reset at every entry point.
let _currPoolDef = null;
let _currAvailDigits = null; // Set<string> of digit chars ('0'–'9') with count > 0

function _initPoolContext(poolDef) {
  _currPoolDef = poolDef;
  _currAvailDigits = new Set();
  for (let d = 0; d <= 9; d++) {
    if ((poolDef[String(d)] ?? 0) > 0) _currAvailDigits.add(String(d));
  }
}

// ── Tile pool definition ──────────────────────────────────────────────────────
export const POOL_DEF = {
  '0':0, '1':4, '2':4, '3':4, '4':4, '5':4, '6':4, '7':4, '8':4, '9':4,
  '10':1,'11':1,'12':1,'13':1,'14':1,'15':1,'16':1,'17':1,'18':1,'19':1,'20':1,
  '+':4, '-':4, '×':4, '÷':4, '+/-':4, '×/÷':4, '=':8, '?':2,
};

// ================================================================
// SECTION A — CORE HELPERS
// ================================================================

/**
 * _negTileCount(val)
 *
 * True tile cost of representing a number.
 * Negative numbers require one extra '-' tile for the unary prefix.
 * ALWAYS use this instead of numTiles() when val may be negative.
 */
function _negTileCount(val) {
  if (val === null || val === undefined) return 0;
  const abs = Math.abs(val);
  return val < 0 ? numTiles(abs) + 1 : numTiles(abs);
}

/**
 * negProbFromSpec(opSpec)
 *
 * Returns probability [0,1] of applying a leading unary negative.
 */
function negProbFromSpec(opSpec) {
  if (!opSpec || opSpec['-'] == null) return 0.30;
  const [minM] = toRange(opSpec['-']) ?? [0, 0];
  return Math.min(0.65, 0.20 + minM * 0.12);
}

/**
 * applyNegStart(value, exprStr, p)
 *
 * Optionally negate a positive expression so its first token is '-'.
 */
function applyNegStart(value, exprStr, p = 0.20) {
  if (value === 0 || Math.random() >= p) return { value, expr: exprStr };
  if (value < 0) return { value, expr: exprStr };
  if (!/^\d/.test(exprStr)) return { value, expr: exprStr };
  return { value: -value, expr: '-' + exprStr };
}

/**
 * countBinaryMinusOps(eq)
 *
 * Count only BINARY '-' operators in a finished equation string.
 * Leading unary '-' (negative number prefix) is NOT counted.
 */
export function countBinaryMinusOps(eq) {
  let count = 0;
  for (const side of eq.split('=')) {
    const toks = side.match(/\d+|[+\-×÷]/g);
    if (!toks) continue;
    let seenDigit = false;
    for (const t of toks) {
      if (/\d+/.test(t)) { seenDigit = true; continue; }
      if (t === '-') {
        if (seenDigit) count++;
        else { seenDigit = false; }
      }
    }
  }
  return count;
}

/**
 * countUnaryNegs(eq)
 *
 * Count leading unary '-' signs (negative number prefixes) in eq.
 */
export function countUnaryNegs(eq) {
  let count = 0;
  for (const side of eq.split('=')) {
    const toks = side.match(/\d+|[+\-×÷]/g);
    if (!toks) continue;
    if (toks[0] === '-') count++;
  }
  return count;
}

/**
 * countMinusOps(eq)
 *
 * Legacy export: counts ALL '-' tokens (binary + unary).
 */
export function countMinusOps(eq) {
  let count = 0;
  for (const side of eq.split('=')) {
    const toks = side.match(/\d+|[+\-×÷]/g);
    if (!toks) continue;
    for (const t of toks) { if (t === '-') count++; }
  }
  return count;
}

// ================================================================
// SECTION B — NUMERIC / ALLOCATION HELPERS
// ================================================================

function pickNumForBudget(budget) {
  const avail = _currAvailDigits; // null when no pool context is active
  const pd    = _currPoolDef;

  if (budget === 1) {
    if (avail && pd) {
      const cands = [];
      // Heavy tiles (10-20) are single physical tiles — no per-digit restriction.
      for (let n = 10; n <= 20; n++) { if ((pd[String(n)] ?? 0) > 0) cands.push(n); }
      // Single-digit values need their specific digit tile to be in the pool.
      for (let n = 1; n <= 9; n++)   { if (avail.has(String(n))) cands.push(n); }
      if (cands.length) return cands[0 | (Math.random() * cands.length)];
    }
    return randInt(1, 20);
  }

  if (budget === 2) {
    if (avail) {
      // Try random values first.
      for (let i = 0; i < 50; i++) {
        const n = randInt(21, 99);
        if ([...String(n)].every(d => avail.has(d))) return n;
      }
      // Construct from available digit characters.
      const nz = [...avail].filter(d => d >= '1' && d <= '9');
      const al = [...avail].filter(d => d >= '0' && d <= '9');
      if (nz.length && al.length) {
        for (let i = 0; i < 20; i++) {
          const n = parseInt(nz[0|(Math.random()*nz.length)] + al[0|(Math.random()*al.length)], 10);
          if (n >= 21 && n <= 99) return n;
        }
      }
    }
    return randInt(21, 99);
  }

  if (budget === 3) {
    if (avail) {
      // randInt(100,200): 100-199 ALL start with '1', causing 99% failure when '1' is absent.
      // Extend to 100-999 and filter by available digits.
      for (let i = 0; i < 80; i++) {
        const n = randInt(100, 999);
        if ([...String(n)].every(d => avail.has(d))) return n;
      }
      // Construct from available digit characters.
      const nz = [...avail].filter(d => d >= '1' && d <= '9');
      const al = [...avail].filter(d => d >= '0' && d <= '9');
      if (nz.length && al.length) {
        const d1 = nz[0|(Math.random()*nz.length)];
        const d2 = al[0|(Math.random()*al.length)];
        const d3 = al[0|(Math.random()*al.length)];
        return parseInt(d1 + d2 + d3, 10);
      }
    }
    return randInt(100, 200);
  }

  return randInt(1, 9);
}

/**
 * distributeTileBudget(total, nSlots)
 *
 * v7.2 FIX: lower bound relaxed by 2 to accommodate tight budgets
 * caused by unary '-' tiles that are handled outside this allocator.
 *
 * Each slot gets an integer in [1,3] summing to total.
 * Returns null only when genuinely infeasible.
 */
function distributeTileBudget(total, nSlots) {
  if (nSlots <= 0) return null;
  // v7.2: allow total to be up to 2 below nSlots (slack for unary '-' tiles)
  if (total < Math.max(1, nSlots - 2) || total > 3 * nSlots) return null;

  // When total < nSlots, some slots must share a tile — clamp to 1 minimum
  // and let the loop distribute as evenly as possible.
  const effectiveTotal = Math.max(total, nSlots);
  const result = new Array(nSlots);
  let remaining = effectiveTotal;

  for (let i = 0; i < nSlots; i++) {
    const slotsLeft = nSlots - 1 - i;
    const lo = Math.max(1, remaining - 3 * slotsLeft);
    const hi = Math.min(3, remaining - slotsLeft);
    if (lo > hi) return null;
    result[i] = lo + Math.floor(Math.random() * (hi - lo + 1));
    remaining -= result[i];
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function pickOperatorsForSpec(N, spec) {
  if (N <= 0) return [];
  const ops = [];

  if (spec) {
    const totalMin = Object.values(spec)
      .map(toRange)
      .reduce((s, r) => s + (r ? r[0] : 0), 0);
    if (totalMin > N) return null;
  }

  if (spec) {
    for (const [op, constraint] of Object.entries(spec)) {
      if (!OPS_ALL.includes(op)) continue;
      const rr = toRange(constraint);
      if (!rr || rr[0] <= 0) continue;
      const effectiveMin = Math.min(rr[0], rr[1]);
      for (let i = 0; i < effectiveMin && ops.length < N; i++) ops.push(op);
    }
  }

  while (ops.length < N) {
    const avail = OPS_ALL.filter(op => {
      if (!spec) return true;
      const rr = toRange(spec[op]);
      if (!rr) return true;
      const effectiveMax = rr[1];
      return ops.filter(o => o === op).length < effectiveMax;
    });
    if (!avail.length) return null;
    ops.push(avail[Math.floor(Math.random() * avail.length)]);
  }

  return ops.slice(0, N);
}

function buildExprStr(nums, ops) {
  let s = String(nums[0]);
  for (let i = 0; i < ops.length; i++) s += ops[i] + String(nums[i + 1]);
  return s;
}

// ================================================================
// SECTION C — eqCount=1 BUILDERS
// ================================================================

/**
 * tryBuildEq1Forward_tight  (v7.3)
 *
 * Handles tight budget: numBudget < lhsOps.length + 2
 * (e.g. 8-tile 3-op 1-eq: numBudget=4, need 5 number slots).
 *
 * Key insight: one op tile is repurposed as a unary '-' on the result,
 * so the LHS uses only (N_ops - 1) binary operators:
 *
 *   n1 OP … n_N = -digit
 *
 * where N = lhsOps.length (= KL for N-1 binary ops), and the LHS
 * must evaluate to a negative single-digit value in [-9, -1].
 *
 * Tile accounting for N_ops=3, targetTile=8:
 *   LHS numbers : N_ops = 3 tiles  (each single-digit)
 *   Binary ops  : N_ops-1 = 2 tiles
 *   Equal       : 1 tile
 *   Unary '-'   : 1 tile  (the freed 3rd op tile)
 *   Result digit: 1 tile
 *   Total       : 3+2+1+1+1 = 8 ✓
 *
 * Example output: "2-9+4=-3", "1-6+2=-3", "3-7+1=-3"
 */
function tryBuildEq1Forward_tight(lhsOps, numBudget) {
  if (lhsOps.length === 0) return null;

  // Drop one op from LHS → it becomes the unary '-' on the result.
  const effectiveLhsOps = lhsOps.slice(0, -1);
  const KL = effectiveLhsOps.length + 1;  // number slots on LHS = lhsOps.length
  const lhsBudgetTotal = numBudget - 1;   // 1 tile reserved for result digit

  if (lhsBudgetTotal < 1) return null;

  for (let attempt = 0; attempt < 80; attempt++) {
    const lhsBudgets = lhsBudgetTotal >= KL
      ? distributeTileBudget(lhsBudgetTotal, KL)
      : Array(KL).fill(1);
    if (!lhsBudgets) continue;

    const lhsNums = lhsBudgets.map(b => pickNumForBudget(Math.max(1, b)));
    const lhsExpr = buildExprStr(lhsNums, effectiveLhsOps);
    const lhsVal  = evalExpr(lhsExpr);
    if (lhsVal === null) continue;

    // LHS must evaluate to a negative single-digit so the result "-digit"
    // costs exactly 2 tiles (1 op tile already counted in N_ops + 1 digit tile).
    if (lhsVal >= -9 && lhsVal <= -1) {
      const eq = lhsExpr + '=' + String(lhsVal);
      if (isValidEquation(eq, 1)) return eq;
    }
  }
  return null;
}

/**
 * tryBuildEq1Forward  (v7.3)
 *
 * Tight-budget guard: when numBudget < KL+1 (not enough number tiles for
 * KL LHS slots + 1 result slot), the standard path would always produce a
 * tile-count mismatch. Route to the tight path immediately so we get the
 * correct negative-result structure (e.g. 8-tile 3-op → "2-9+4=-3").
 */
function tryBuildEq1Forward(lhsOps, numBudget, opSpec = null) {
  const KL = lhsOps.length + 1;
  // v7.3: explicit tight-budget check — distributeTileBudget(numBudget, KL+1)
  // may still succeed in this case (returns all-1 arrays) but would produce
  // a (KL+1)-number equation that is one tile too long.
  if (numBudget < KL + 1) {
    return tryBuildEq1Forward_tight(lhsOps, numBudget);
  }
  const budgets = distributeTileBudget(numBudget, KL + 1);
  if (!budgets) {
    return tryBuildEq1Forward_tight(lhsOps, numBudget);
  }

  const lhsBudgets = budgets.slice(0, KL);
  const resultBudget = budgets[KL];
  const negP = negProbFromSpec(opSpec);

  // ── Special backward-solve path for single ÷ ──
  if (KL === 2 && lhsOps[0] === '÷') {
    for (let attempt = 0; attempt < 30; attempt++) {
      const V = pickNumForBudget(resultBudget);
      if (V < RESULT_MIN || V > RESULT_MAX) continue;
      if (numTiles(V) !== resultBudget) continue;
      const b = pickNumForBudget(lhsBudgets[1]);
      if (b === 0) continue;
      const a = V * b;
      if (a < 0 || a > RESULT_MAX) continue;
      if (numTiles(a) !== lhsBudgets[0]) continue;
      if (numTiles(b) !== lhsBudgets[1]) continue;
      const eq = `${a}÷${b}=${V}`;
      if (isValidEquation(eq, 1)) return eq;
    }
    return null;
  }

  // ── Standard forward path ──
  const lhsNums = lhsBudgets.map(b => pickNumForBudget(b));
  const lhsExprBase = buildExprStr(lhsNums, lhsOps);
  const lhsValBase  = evalExpr(lhsExprBase);
  if (lhsValBase === null) return null;

  const canNeg = lhsValBase > 0;
  const { value: lhsVal, expr: lhsExpr } = canNeg
    ? applyNegStart(lhsValBase, lhsExprBase, negP)
    : { value: lhsValBase, expr: lhsExprBase };

  if (lhsVal < RESULT_MIN || lhsVal > RESULT_MAX) return null;
  if (_negTileCount(lhsVal) !== resultBudget) return null;

  const eq = lhsExpr + '=' + String(lhsVal);
  return isValidEquation(eq, 1) ? eq : null;
}

/**
 * tryBuildEq1Flip  (v7.3)
 *
 * Same tight-budget guard as tryBuildEq1Forward.
 */
function tryBuildEq1Flip(rhsOps, numBudget, opSpec = null) {
  const KR = rhsOps.length + 1;
  if (numBudget < KR + 1) {
    return tryBuildEq1Forward_tight(rhsOps, numBudget);
  }
  const budgets = distributeTileBudget(numBudget, KR + 1);
  if (!budgets) {
    return tryBuildEq1Forward_tight(rhsOps, numBudget);
  }

  const resultBudget = budgets[0];
  const rhsBudgets   = budgets.slice(1);
  const negP = negProbFromSpec(opSpec);

  // ── Special backward-solve path for single ÷ ──
  if (KR === 2 && rhsOps[0] === '÷') {
    for (let attempt = 0; attempt < 30; attempt++) {
      const V = pickNumForBudget(resultBudget);
      if (V < RESULT_MIN || V > RESULT_MAX) continue;
      if (numTiles(V) !== resultBudget) continue;
      const b = pickNumForBudget(rhsBudgets[1]);
      if (b === 0) continue;
      const a = V * b;
      if (a < 0 || a > RESULT_MAX) continue;
      if (numTiles(a) !== rhsBudgets[0]) continue;
      if (numTiles(b) !== rhsBudgets[1]) continue;
      const eq = `${V}=${a}÷${b}`;
      if (isValidEquation(eq, 1)) return eq;
    }
    return null;
  }

  // ── Standard forward path ──
  const rhsNums     = rhsBudgets.map(b => pickNumForBudget(b));
  const rhsExprBase = buildExprStr(rhsNums, rhsOps);
  const rhsValBase  = evalExpr(rhsExprBase);
  if (rhsValBase === null) return null;

  const canNeg = rhsValBase > 0;
  const { value: rhsVal, expr: rhsExpr } = canNeg
    ? applyNegStart(rhsValBase, rhsExprBase, negP)
    : { value: rhsValBase, expr: rhsExprBase };

  if (rhsVal < RESULT_MIN || rhsVal > RESULT_MAX) return null;
  if (_negTileCount(rhsVal) !== resultBudget) return null;

  const eq = String(rhsVal) + '=' + rhsExpr;
  return isValidEquation(eq, 1) ? eq : null;
}

function tryBuildEq1Balanced(lhsOps, rhsOps, numBudget, opSpec = null) {
  const KL = lhsOps.length + 1;
  const KR = rhsOps.length + 1;
  const negP = negProbFromSpec(opSpec);

  if (numBudget < KL + KR || numBudget > 3 * (KL + KR)) return null;

  const lhsMax = Math.min(3 * KL, numBudget - KR);
  const lhsMin = Math.max(KL, numBudget - 3 * KR);
  if (lhsMin > lhsMax) return null;
  const lhsBudgetTotal = lhsMin + Math.floor(Math.random() * (lhsMax - lhsMin + 1));
  const rhsBudgetTotal = numBudget - lhsBudgetTotal;

  const lhsBudgets = distributeTileBudget(lhsBudgetTotal, KL);
  if (!lhsBudgets) return null;

  const lhsNums     = lhsBudgets.map(b => pickNumForBudget(b));
  const lhsExprBase = buildExprStr(lhsNums, lhsOps);
  const lhsValRBase = evalExprRational(lhsExprBase);
  if (!lhsValRBase) return null;

  const canNegLhs = lhsValRBase.d === 1 && lhsValRBase.n > 0;

  let lhsExpr = lhsExprBase;
  let lhsValR = { n: lhsValRBase.n, d: lhsValRBase.d };

  if (canNegLhs && Math.random() < negP) {
    lhsExpr = '-' + lhsExprBase;
    lhsValR = { n: -lhsValRBase.n, d: lhsValRBase.d };
  }

  const lhsValNum = lhsValR.n / lhsValR.d;
  if (lhsValNum < RESULT_MIN || lhsValNum > RESULT_MAX) return null;

  // ── Backward-solve path for single rhs ÷ ──
  if (KR === 2 && rhsBudgetTotal >= 2 && lhsValR.d === 1) {
    const lhsVal = lhsValR.n;
    const rhsOp  = rhsOps[0];
    const freeBudget        = Math.max(1, rhsBudgetTotal - 1);
    const constrainedBudget = rhsBudgetTotal - freeBudget;

    if (rhsOp === '÷') {
      for (let attempt = 0; attempt < 20; attempt++) {
        const freeNum = pickNumForBudget(freeBudget);
        if (freeNum === 0) continue;
        const constrainedNum = lhsVal * freeNum;
        if (constrainedNum < 0 || constrainedNum > RESULT_MAX) continue;
        if (numTiles(constrainedNum) !== constrainedBudget) continue;
        if (numTiles(freeNum) !== freeBudget) continue;
        const rhsExpr = `${constrainedNum}÷${freeNum}`;
        const rhsValR = evalExprRational(rhsExpr);
        if (rhsValR && rhsValR.n === lhsValR.n && rhsValR.d === lhsValR.d) {
          const eq = lhsExpr + '=' + rhsExpr;
          if (isValidEquation(eq, 1, false)) return eq;
        }
      }
    } else if (rhsOp === '×') {
      for (let attempt = 0; attempt < 20; attempt++) {
        const freeNum = pickNumForBudget(freeBudget);
        if (freeNum === 0) {
          if (lhsVal === 0) {
            const cNum = pickNumForBudget(constrainedBudget);
            if (numTiles(cNum) !== constrainedBudget) continue;
            const rhsExpr = `${cNum}×0`;
            const rv = evalExprRational(rhsExpr);
            if (rv && rv.n === lhsValR.n && rv.d === lhsValR.d) {
              const eq = lhsExpr + '=' + rhsExpr;
              if (isValidEquation(eq, 1, false)) return eq;
            }
          }
          continue;
        }
        if (lhsVal % freeNum !== 0) continue;
        const cNum = lhsVal / freeNum;
        if (cNum < 0 || cNum > RESULT_MAX) continue;
        if (numTiles(cNum) !== constrainedBudget) continue;
        if (numTiles(freeNum) !== freeBudget) continue;
        const rhsExpr  = `${freeNum}×${cNum}`;
        const rv = evalExprRational(rhsExpr);
        if (rv && rv.n === lhsValR.n && rv.d === lhsValR.d) {
          const eq = lhsExpr + '=' + rhsExpr;
          if (isValidEquation(eq, 1, false)) return eq;
        }
      }
    } else {
      const freeNum = pickNumForBudget(Math.min(freeBudget, 3));
      let cNum = null;
      if (rhsOp === '+') cNum = lhsVal - freeNum;
      else if (rhsOp === '-') cNum = lhsVal + freeNum;
      if (
        cNum !== null && cNum >= 0 && cNum <= RESULT_MAX &&
        numTiles(cNum) === constrainedBudget
      ) {
        const rhsExpr = rhsOp === '+' ? `${freeNum}+${cNum}` : `${cNum}-${freeNum}`;
        const rv = evalExprRational(rhsExpr);
        if (rv && rv.n === lhsValR.n && rv.d === lhsValR.d) {
          const eq = lhsExpr + '=' + rhsExpr;
          if (isValidEquation(eq, 1, false)) return eq;
        }
      }
    }
  }

  const rhsBudgets = distributeTileBudget(rhsBudgetTotal, KR);
  if (!rhsBudgets) return null;
  const rhsNums  = rhsBudgets.map(b => pickNumForBudget(b));
  const rhsExpr2 = buildExprStr(rhsNums, rhsOps);
  const rhsVal2R = evalExprRational(rhsExpr2);
  if (!rhsVal2R || rhsVal2R.n !== lhsValR.n || rhsVal2R.d !== lhsValR.d) return null;

  const eq = lhsExpr + '=' + rhsExpr2;
  return isValidEquation(eq, 1, false) ? eq : null;
}

function tryBuildEq1FractionAddSub(ops, numBudget) {
  if (ops.length !== 3) return null;
  const divN      = ops.filter(o => o === '÷').length;
  const hasAddSub = ops.includes('+') || ops.includes('-');
  if (divN < 2 || !hasAddSub) return null;

  const pmOp = ops.includes('-') ? '-' : '+';
  const gcd  = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; };
  const pickReducedFraction = (nb, db) => {
    for (let i = 0; i < 120; i++) {
      const n = pickNumForBudget(nb);
      const d = pickNumForBudget(db);
      if (d <= 1 || n % d === 0 || gcd(n, d) !== 1) continue;
      return [n, d];
    }
    return null;
  };

  {
    const budgets = distributeTileBudget(numBudget, 5);
    if (budgets) {
      const [ab, bb, cb, db, rb] = budgets;
      for (let t = 0; t < 80; t++) {
        const f1 = pickReducedFraction(ab, bb);
        const f2 = pickReducedFraction(cb, db);
        if (!f1 || !f2) continue;
        const [a, b] = f1; const [c, d] = f2;
        const rhs = pickNumForBudget(rb);
        const eq  = `${a}÷${b}${pmOp}${c}÷${d}=${rhs}`;
        if (isValidEquation(eq, 1, false)) return eq;
      }
    }
  }
  {
    const budgets = distributeTileBudget(numBudget, 5);
    if (budgets) {
      const [ab, bb, cb, eb, fb] = budgets;
      for (let t = 0; t < 120; t++) {
        const f1 = pickReducedFraction(ab, bb);
        const fR = pickReducedFraction(eb, fb);
        if (!f1 || !fR) continue;
        const [a, b] = f1;
        const c      = pickNumForBudget(cb);
        const [e, f] = fR;
        const eq     = `${a}÷${b}${pmOp}${c}=${e}÷${f}`;
        if (isValidEquation(eq, 1, false)) return eq;
      }
    }
  }
  return null;
}

// ================================================================
// SECTION D — eqCount=2 BUILDERS
// ================================================================

/**
 * tryBuildChainEq2  (v7.2)
 *
 * Tight-budget guard relaxed: lhsTotal allowed down to KL-2.
 */
function tryBuildChainEq2(ops, numBudget, opSpec = null) {
  const KL = ops.length + 1;
  const negP = negProbFromSpec(opSpec);

  if (ops.length === 1 && ops[0] === '÷') {
    for (let vBudget = 1; vBudget <= 2; vBudget++) {
      const lhsTotal = numBudget - 2 * vBudget;
      // v7.2: allow slight under-budget for unary '-' slack
      if (lhsTotal < Math.max(1, KL - 2) || lhsTotal > 3 * KL) continue;
      const lhsBudgets = distributeTileBudget(lhsTotal, KL);
      if (!lhsBudgets) continue;
      for (let attempt = 0; attempt < 30; attempt++) {
        const V = pickNumForBudget(vBudget);
        if (V < RESULT_MIN || V > RESULT_MAX || numTiles(V) !== vBudget) continue;
        const b = pickNumForBudget(lhsBudgets[1]);
        if (b === 0) continue;
        const a = V * b;
        if (a < 0 || a > RESULT_MAX) continue;
        if (numTiles(a) !== lhsBudgets[0] || numTiles(b) !== lhsBudgets[1]) continue;
        const eq = `${a}÷${b}=${V}=${V}`;
        if (isValidEquation(eq, 2)) return eq;
      }
    }
    return null;
  }

  const hasDivInOps = ops.includes('÷');
  const CHAIN_TRIES = hasDivInOps ? 50 : 15;
  const canNegLhs = true;

  for (let vBudget = 1; vBudget <= 2; vBudget++) {
    const lhsTotal = numBudget - 2 * vBudget;
    // v7.2: relaxed lower bound
    if (lhsTotal < Math.max(1, KL - 2) || lhsTotal > 3 * KL) continue;

    if (hasDivInOps) {
      for (let vAttempt = 0; vAttempt < 40; vAttempt++) {
        const V = pickNumForBudget(vBudget);
        if (V < RESULT_MIN || V > RESULT_MAX || numTiles(V) !== vBudget) continue;
        const lhsExpr = _buildExprForTarget(V, ops, lhsTotal, opSpec);
        if (!lhsExpr) continue;
        const eq = `${lhsExpr}=${V}=${V}`;
        if (isValidEquation(eq, 2)) return eq;
      }
    }

    for (let attempt = 0; attempt < CHAIN_TRIES; attempt++) {
      const lhsBudgets  = distributeTileBudget(lhsTotal, KL);
      if (!lhsBudgets) continue;
      const lhsNums     = lhsBudgets.map(b => pickNumForBudget(b));
      const lhsExprBase = buildExprStr(lhsNums, ops);
      const lhsValBase  = evalExpr(lhsExprBase);
      if (lhsValBase === null || lhsValBase < RESULT_MIN || lhsValBase > RESULT_MAX) continue;

      const { value: v, expr: lhsExpr } = canNegLhs && lhsValBase > 0
        ? applyNegStart(lhsValBase, lhsExprBase, negP)
        : { value: lhsValBase, expr: lhsExprBase };

      if (_negTileCount(v) !== vBudget) continue;
      const eq = `${lhsExpr}=${v}=${v}`;
      if (isValidEquation(eq, 2)) return eq;
    }
  }
  return null;
}

/**
 * tryBuildThreeWayEq2  (v7.2)
 *
 * canNegLhs expanded to ALL operator types.
 */
function tryBuildThreeWayEq2(lhsOps, rhsOps, numBudget, opSpec = null) {
  const KL = lhsOps.length + 1;
  const KR = rhsOps.length + 1;
  const Ktotal = KL + KR + 1;
  const negP = negProbFromSpec(opSpec);

  const budgets = distributeTileBudget(numBudget, Ktotal);
  if (!budgets) return null;

  const lhsBudgets = budgets.slice(0, KL);
  const rhsBudgets = budgets.slice(KL, KL + KR);
  const vBudget    = budgets[KL + KR];

  const lhsNums = lhsBudgets.map(b => pickNumForBudget(b));
  const rhsNums = rhsBudgets.map(b => pickNumForBudget(b));

  const lhsExprBase = buildExprStr(lhsNums, lhsOps);
  const rhsExprBase = buildExprStr(rhsNums, rhsOps);

  const lhsVal = evalExpr(lhsExprBase);
  const rhsVal = evalExpr(rhsExprBase);

  if (lhsVal === null || rhsVal === null) return null;
  if (lhsVal !== rhsVal) return null;
  if (lhsVal < RESULT_MIN || lhsVal > RESULT_MAX) return null;
  if (numTiles(lhsVal) !== vBudget) return null;

  const canNegLhs = lhsVal > 0;
  const { value: vFinal, expr: lhsExpr } = canNegLhs
    ? applyNegStart(lhsVal, lhsExprBase, negP)
    : { value: lhsVal, expr: lhsExprBase };

  let rhsExpr = rhsExprBase;
  if (vFinal !== lhsVal) {
    const canNegRhs = rhsVal > 0;
    if (!canNegRhs) return null;
    rhsExpr = '-' + rhsExprBase;
  }

  const vStr = String(vFinal);
  if (_negTileCount(vFinal) !== vBudget) return null;

  const eq = lhsExpr + '=' + rhsExpr + '=' + vStr;
  return isValidEquation(eq, 2) ? eq : null;
}

// ================================================================
// SECTION E — CORE EXPRESSION BUILDER
// ================================================================

/**
 * _buildExprForTarget  (v7.2)
 *
 * leading negative allowed for ALL operator types in single-op branch.
 */
function _buildExprForTarget(V, ops, numBudgetTotal, opSpec = null) {
  const K = ops.length + 1;
  // v7.2: relaxed lower bound (-2 for unary '-' slack)
  if (numBudgetTotal < Math.max(1, K - 2) || numBudgetTotal > 3 * K) return null;
  const negP = negProbFromSpec(opSpec);

  if (ops.length === 0) {
    if (_negTileCount(V) === numBudgetTotal && V >= RESULT_MIN && V <= RESULT_MAX) {
      return String(V);
    }
    return null;
  }

  if (ops.length === 1) {
    const op = ops[0];
    const budgets = distributeTileBudget(numBudgetTotal, 2);
    if (!budgets) return null;
    const [bA, bB] = budgets;

    for (let attempt = 0; attempt < 80; attempt++) {
      let a = null, b = null;

      if (op === '+') {
        b = pickNumForBudget(bB); a = V - b;
      } else if (op === '-') {
        b = pickNumForBudget(bB); a = V + b;
      } else if (op === '×') {
        b = pickNumForBudget(bB);
        if (b !== 0 && V % b === 0) a = V / b;
        else if (b === 0 && V === 0) a = pickNumForBudget(bA);
        else continue;
      } else if (op === '÷') {
        b = pickNumForBudget(bB);
        if (b === 0) continue;
        a = V * b;
      }

      if (a === null || b === null) continue;
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      if (b < 0) continue;

      if (a > RESULT_MAX || b > RESULT_MAX) continue;
      if (Math.abs(a) > RESULT_MAX) continue;

      if (_negTileCount(a) !== bA || numTiles(b) !== bB) continue;

      const expr = `${a}${op}${b}`;
      if (evalExpr(expr) === V) return expr;
    }
    return null;
  }

  // Multi-op case
  const budgets = distributeTileBudget(numBudgetTotal, K);
  if (!budgets) return null;

  const MAX_ATTEMPTS = 120;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let nums;

    if (attempt < 60) {
      nums = budgets.map(b => pickNumForBudget(b));
    } else {
      nums = budgets.map(b => pickNumForBudget(b));
      const partialNums = nums.slice(0, K - 1);
      const partialExpr = buildExprStr(partialNums, ops.slice(0, K - 2));
      const partialVal  = ops.length >= 2 ? evalExpr(partialExpr) : partialNums[0];
      if (partialVal !== null) {
        const lastOp = ops[ops.length - 1];
        let lastNum = null;
        if (lastOp === '+') lastNum = V - partialVal;
        else if (lastOp === '-') lastNum = partialVal - V;
        else if (lastOp === '×' && partialVal !== 0 && V % partialVal === 0) lastNum = V / partialVal;
        else if (lastOp === '÷' && nums[K - 1] !== 0) lastNum = null;
        if (lastNum !== null && lastNum >= 0 && numTiles(lastNum) === budgets[K - 1]) {
          nums[K - 1] = lastNum;
        }
      }
    }

    const baseExpr = buildExprStr(nums, ops);
    const baseVal  = evalExpr(baseExpr);
    if (baseVal === null) continue;

    if (baseVal === V) return baseExpr;

    if (baseVal === -V && V < 0) return baseExpr;

    if (-baseVal === V && V < 0) {
      const negExpr = '-' + baseExpr;
      if (evalExpr(negExpr) === V) return negExpr;
    }
  }

  return null;
}

// ================================================================
// SECTION F — eqCount=3 BUILDER
// ================================================================

/**
 * _tryBuildEq3  (v7.2)
 *
 * KEY FIXES (carried from v7.1 + v7.2 relaxed budget guards):
 * - Pattern A & D negated path: vBudget+1 for the '-' tile.
 * - Pattern B negated path: vBudgetNeg = vBudget+1.
 */
function _tryBuildEq3(ops, numBudget, opSpec = null) {
  const N          = ops.length;
  const MAX_OUTER  = 80;
  const negP       = negProbFromSpec(opSpec);

  for (let outer = 0; outer < MAX_OUTER; outer++) {
    const vBudget = Math.random() < 0.75 ? 1 : 2;
    const V       = vBudget === 1 ? randInt(1, 20) : randInt(21, 99);
    if (V < RESULT_MIN || V > RESULT_MAX) continue;
    if (numTiles(V) !== vBudget) continue;

    // ── Pattern A: expr = V = V = V ──
    {
      const exprBudget = numBudget - 3 * vBudget;
      if (exprBudget >= Math.max(1, N) && exprBudget <= 3 * (N + 1)) {
        const exprBase = _buildExprForTarget(V, ops, exprBudget, opSpec);
        if (exprBase) {
          const eq2 = `${exprBase}=${V}=${V}=${V}`;
          if (isValidEquation(eq2, 3)) return eq2;

          const vBudgetNeg = vBudget + 1;
          const exprBudgetNeg = numBudget - 3 * vBudgetNeg;
          if (exprBudgetNeg >= Math.max(1, N) && exprBudgetNeg <= 3 * (N + 1)) {
            const exprForNeg = _buildExprForTarget(V, ops, exprBudgetNeg, opSpec);
            if (exprForNeg && Math.random() < negP) {
              const negV    = -V;
              const negExpr = '-' + exprForNeg;
              if (evalExpr(negExpr) === negV) {
                const vStr = String(negV);
                const eqN  = `${negExpr}=${vStr}=${vStr}=${vStr}`;
                if (isValidEquation(eqN, 3)) return eqN;
              }
            }
          }
        }
      }
    }

    // ── Pattern B: expr1 = expr2 = V = V ──
    if (N >= 1) {
      const splitPoints = N === 1
        ? [1]
        : shuffle(Array.from({ length: N - 1 }, (_, i) => i + 1)).slice(0, 3);
      for (const splitAt of splitPoints) {
        const lhsOps = ops.slice(0, splitAt);
        const rhsOps = ops.slice(splitAt);
        const KL = lhsOps.length + 1;
        const KR = rhsOps.length + 1;

        // Non-negated path
        {
          const exprTotal = numBudget - 2 * vBudget;
          const minLhs = Math.max(1, KL - 2);
          const maxLhs = Math.min(3 * KL, exprTotal - Math.max(1, KR - 2));
          if (maxLhs >= minLhs && exprTotal > 0) {
            for (let budgetTry = 0; budgetTry < 8; budgetTry++) {
              const lhsBudgetTotal = randInt(minLhs, maxLhs);
              const rhsBudgetTotal = exprTotal - lhsBudgetTotal;
              if (rhsBudgetTotal < Math.max(1, KR - 2) || rhsBudgetTotal > 3 * KR) continue;
              const lhsExpr = _buildExprForTarget(V, lhsOps, lhsBudgetTotal, opSpec);
              if (!lhsExpr) continue;
              const rhsExpr = _buildExprForTarget(V, rhsOps, rhsBudgetTotal, opSpec);
              if (!rhsExpr) continue;
              const vStr = String(V);
              const eq   = `${lhsExpr}=${rhsExpr}=${vStr}=${vStr}`;
              if (isValidEquation(eq, 3)) return eq;
            }
          }
        }

        // Negated path — vBudgetNeg = vBudget+1
        if (Math.random() < negP) {
          const vBudgetNeg = vBudget + 1;
          const exprTotal = numBudget - 2 * vBudgetNeg;
          const minLhs = Math.max(1, KL - 2);
          const maxLhs = Math.min(3 * KL, exprTotal - Math.max(1, KR - 2));
          if (maxLhs >= minLhs && exprTotal > 0) {
            for (let budgetTry = 0; budgetTry < 6; budgetTry++) {
              const lhsBudgetTotal = randInt(minLhs, maxLhs);
              const rhsBudgetTotal = exprTotal - lhsBudgetTotal;
              if (rhsBudgetTotal < Math.max(1, KR - 2) || rhsBudgetTotal > 3 * KR) continue;
              const lhsExpr = _buildExprForTarget(V, lhsOps, lhsBudgetTotal, opSpec);
              if (!lhsExpr) continue;
              const rhsExpr = _buildExprForTarget(V, rhsOps, rhsBudgetTotal, opSpec);
              if (!rhsExpr) continue;
              const negV     = -V;
              const lhsNeg   = '-' + lhsExpr;
              const rhsNeg   = '-' + rhsExpr;
              if (evalExpr(lhsNeg) !== negV || evalExpr(rhsNeg) !== negV) continue;
              const vStr = String(negV);
              const eqN  = `${lhsNeg}=${rhsNeg}=${vStr}=${vStr}`;
              if (isValidEquation(eqN, 3)) return eqN;
            }
          }
        }
      }
    }

    // ── Pattern C: expr1 = expr2 = expr3 = V ──
    if (N >= 2) {
      for (let splitTry = 0; splitTry < 6; splitTry++) {
        let s1, s2;
        if (N === 2) { s1 = 1; s2 = 2; }
        else {
          s1 = randInt(1, N - 1);
          s2 = randInt(s1 + 1, N);
          if (s2 <= s1) continue;
        }
        const ops1 = ops.slice(0, s1);
        const ops2 = ops.slice(s1, s2);
        const ops3 = ops.slice(s2);
        const K1 = ops1.length + 1;
        const K2 = ops2.length + 1;
        const K3 = ops3.length + 1;
        const exprTotal = numBudget - vBudget;
        const minTotal  = Math.max(3, K1 + K2 + K3 - 2);
        const maxTotal  = 3 * (K1 + K2 + K3);
        if (exprTotal < minTotal || exprTotal > maxTotal) continue;

        for (let bt = 0; bt < 8; bt++) {
          const b1 = randInt(Math.max(1, K1 - 1), Math.min(3 * K1, exprTotal - Math.max(2, K2 + K3 - 2)));
          const rem = exprTotal - b1;
          const b2  = randInt(Math.max(1, K2 - 1), Math.min(3 * K2, rem - Math.max(1, K3 - 1)));
          const b3  = rem - b2;
          if (b3 < Math.max(1, K3 - 1) || b3 > 3 * K3) continue;
          const e1 = _buildExprForTarget(V, ops1, b1, opSpec);
          if (!e1) continue;
          const e2 = _buildExprForTarget(V, ops2, b2, opSpec);
          if (!e2) continue;
          const e3 = _buildExprForTarget(V, ops3, b3, opSpec);
          if (!e3) continue;
          const eq = `${e1}=${e2}=${e3}=${V}`;
          if (isValidEquation(eq, 3)) return eq;
        }
      }
    }
  }

  // ── Pattern D: exhaustive algebraic search ──
  if (N >= 1) {
    for (let vb = 1; vb <= 2; vb++) {
      // Non-negated: 3×vb tiles for the three V slots
      {
        const eb  = numBudget - 3 * vb;
        if (eb >= Math.max(1, N - 1) && eb <= 3 * (N + 1)) {
          const vLo = vb === 1 ? RESULT_MIN : 10;
          const vHi = vb === 1 ? 20 : Math.min(99, RESULT_MAX);
          const vCandidates = [];
          for (let v = Math.max(1, vLo); v <= vHi; v++) {
            if (numTiles(v) === vb) vCandidates.push(v);
          }
          shuffle(vCandidates);

          for (const Vc of vCandidates) {
            const expr = _buildExprForTarget(Vc, ops, eb, opSpec);
            if (expr) {
              const eq = `${expr}=${Vc}=${Vc}=${Vc}`;
              if (isValidEquation(eq, 3)) return eq;
            }

            if (N >= 2) {
              const splitAt = 1 + Math.floor(Math.random() * (N - 1));
              const lOps = ops.slice(0, splitAt);
              const rOps = ops.slice(splitAt);
              const KL   = lOps.length + 1;
              const KR   = rOps.length + 1;
              const exprTotal = numBudget - 2 * vb;
              const minL  = Math.max(1, KL - 1);
              const maxL  = Math.min(3 * KL, exprTotal - Math.max(1, KR - 1));
              if (maxL >= minL) {
                for (let lBudget = minL; lBudget <= maxL; lBudget++) {
                  const rBudget = exprTotal - lBudget;
                  if (rBudget < Math.max(1, KR - 1) || rBudget > 3 * KR) continue;
                  const le = _buildExprForTarget(Vc, lOps, lBudget, opSpec);
                  if (!le) continue;
                  const re = _buildExprForTarget(Vc, rOps, rBudget, opSpec);
                  if (!re) continue;
                  const eq = `${le}=${re}=${Vc}=${Vc}`;
                  if (isValidEquation(eq, 3)) return eq;
                }
              }
            }
          }
        }
      }

      // Negated path — vbNeg = vb+1 tiles for "-V"
      {
        const vbNeg = vb + 1;
        const eb    = numBudget - 3 * vbNeg;
        if (eb >= Math.max(1, N - 1) && eb <= 3 * (N + 1) && Math.random() < negP) {
          const vLo = vb === 1 ? 1 : 10;
          const vHi = vb === 1 ? 20 : Math.min(99, RESULT_MAX);
          const vCandidates = [];
          for (let v = vLo; v <= vHi; v++) {
            if (numTiles(v) === vb) vCandidates.push(v);
          }
          shuffle(vCandidates);

          for (const Vc of vCandidates) {
            const expr = _buildExprForTarget(Vc, ops, eb, opSpec);
            if (expr) {
              const negV    = -Vc;
              const negExpr = '-' + expr;
              if (evalExpr(negExpr) === negV) {
                const vStr = String(negV);
                const eqN  = `${negExpr}=${vStr}=${vStr}=${vStr}`;
                if (isValidEquation(eqN, 3)) return eqN;
              }
            }
          }
        }
      }
    }
  }

  // ── Fallback: 0-operator chain V=V=V=V ──
  if (N === 0) {
    for (let vb = 1; vb <= 3; vb++) {
      if (4 * vb !== numBudget) continue;
      for (let attempt = 0; attempt < 30; attempt++) {
        const Vf = pickNumForBudget(vb);
        if (Vf < RESULT_MIN || Vf > RESULT_MAX || numTiles(Vf) !== vb) continue;
        const eq = `${Vf}=${Vf}=${Vf}=${Vf}`;
        if (isValidEquation(eq, 3)) return eq;
      }
    }
  }

  return null;
}

// ================================================================
// SECTION G — TOP-LEVEL CONSTRUCTORS
// ================================================================

/**
 * constructEquationV6  (v7.2)
 *
 * FIX: numBudget/numSlots guard relaxed by -2 for unary '-' slack.
 * _passesMinusTileFilter uses countBinaryMinusOps (not countMinusOps).
 */
export function constructEquationV6(N_ops, eqCount, targetTile, opSpec, poolDef = POOL_DEF) {
  // Initialise pool context so pickNumForBudget avoids excluded digit tiles.
  _initPoolContext(poolDef);

  const MAX_TRIES  = eqCount >= 3 ? 150 : (targetTile <= 11 ? 70 : 120);
  const numBudget  = targetTile - eqCount - N_ops;
  const numSlots   = N_ops + eqCount + 1;

  // v7.2 FIX: allow up to 2 below numSlots for unary '-' overhead
  if (numBudget < Math.max(1, numSlots - 2) || numBudget > 3 * numSlots) return null;

  const minusRange = toRange(opSpec?.['-'] ?? null);

  // Use total '-' tile count (binary + unary) to match satisfiesConfigFromCounts,
  // which counts all physical '-' tiles regardless of role (binary op vs unary sign).
  const _passesMinusTileFilter = (eq) => {
    if (!minusRange) return true;
    const totalMinus = countMinusOps(eq);
    return totalMinus >= minusRange[0] && totalMinus <= minusRange[1];
  };

  for (let t = 0; t < MAX_TRIES; t++) {
    const ops = pickOperatorsForSpec(N_ops, opSpec);
    if (!ops) continue;

    const opsShuffled = shuffle([...ops]);
    let eq = null;

    if      (eqCount === 1) eq = _tryBuildEq1(opsShuffled, numBudget, opSpec, poolDef);
    else if (eqCount === 2) eq = _tryBuildEq2(opsShuffled, numBudget, opSpec);
    else if (eqCount === 3) eq = _tryBuildEq3(opsShuffled, numBudget, opSpec);

    if (!eq) continue;

    try {
      const tc = equationToTileCounts(eq, { preferHeavy: true });
      if (sumCounts(tc) !== targetTile) continue;
      // Reject equations whose digit tiles exceed pool supply — avoids wasting
      // external retries on equations that can never be represented by the tile bag.
      if (!withinPoolLimits(tc, poolDef)) continue;
    } catch {
      continue;
    }

    if (!_passesMinusTileFilter(eq)) continue;

    return eq;
  }

  // ── Fallback tier 1: simple '+' chain ──
  const fallbackTries = eqCount >= 3 ? 80 : (targetTile <= 11 ? 35 : 60);
  for (let t = 0; t < fallbackTries; t++) {
    const simpleOps = N_ops > 0 ? Array(N_ops).fill('+') : [];
    let eq = null;
    if      (eqCount === 1) eq = tryBuildEq1Forward(simpleOps, numBudget, opSpec);
    else if (eqCount === 2) eq = tryBuildChainEq2(simpleOps, numBudget, opSpec);
    else if (eqCount === 3) eq = _tryBuildEq3(simpleOps, numBudget, opSpec);
    if (!eq) continue;
    try {
      const tc = equationToTileCounts(eq, { preferHeavy: true });
      if (sumCounts(tc) !== targetTile) continue;
      if (!withinPoolLimits(tc, poolDef)) continue;
      if (!_passesMinusTileFilter(eq)) continue;
      return eq;
    } catch { /* ignore */ }
  }

  return null;
}

// ── Private dispatcher helpers ────────────────────────────────────────────────

function _tryBuildEq1(ops, numBudget, opSpec = null, poolDef = POOL_DEF) {
  const N = ops.length;

  const coreTotal = (poolDef['+'] || 0) + (poolDef['-'] || 0) + (poolDef['×'] || 0) + (poolDef['÷'] || 0);
  const divShare  = coreTotal > 0 ? (poolDef['÷'] || 0) / coreTotal : 0;
  const pmShare   = coreTotal > 0 ? ((poolDef['+'] || 0) + (poolDef['-'] || 0)) / coreTotal : 0;
  let fracChance  = clamp(divShare * pmShare * 1.2, 0.02, 0.35);
  const divMin    = toRange(opSpec?.['÷'])?.[0] ?? 0;
  const plusMin   = toRange(opSpec?.['+'])?.[0] ?? 0;
  const minusMin  = toRange(opSpec?.['-'])?.[0] ?? 0;
  if (divMin >= 2 && (plusMin > 0 || minusMin > 0)) fracChance = Math.max(fracChance, 0.18);
  if (Math.random() < fracChance) {
    const fracAddSub = tryBuildEq1FractionAddSub(ops, numBudget);
    if (fracAddSub) return fracAddSub;
  }

  let style;
  if (N === 1)      style = weightedSample(['fwd','flip'],       [7, 3]);
  else if (N === 2) style = weightedSample(['fwd','flip','bal'], [4, 2, 4]);
  else              style = weightedSample(['fwd','bal'],         [4, 6]);

  if (style === 'fwd')  return tryBuildEq1Forward(ops, numBudget, opSpec);
  if (style === 'flip') return tryBuildEq1Flip(ops, numBudget, opSpec);

  const splitAt = 1 + Math.floor(Math.random() * (N - 1));
  const balanced = tryBuildEq1Balanced(ops.slice(0, splitAt), ops.slice(splitAt), numBudget, opSpec);
  return balanced ?? tryBuildEq1Forward(ops, numBudget, opSpec);
}

function _tryBuildEq2(ops, numBudget, opSpec = null) {
  const N        = ops.length;
  const useChain = N <= 1 || Math.random() < 0.55;
  if (useChain || N < 2) return tryBuildChainEq2(ops, numBudget, opSpec);

  const splitAt = 1 + Math.floor(Math.random() * (N - 1));
  return tryBuildThreeWayEq2(ops.slice(0, splitAt), ops.slice(splitAt), numBudget, opSpec) ??
         tryBuildChainEq2(ops, numBudget, opSpec);
}

// ── Public convenience constructor ────────────────────────────────────────────

export function constructEquation(eqCount, opts = {}) {
  const { targetTiles = null } = opts;

  if (targetTiles != null) {
    const N_ops = randInt(1, Math.min(3, targetTiles - eqCount - 2));
    const eq    = constructEquationV6(N_ops, eqCount, targetTiles, null, POOL_DEF);
    if (eq) return eq;
  }

  const MAX_TRIES = 500;
  for (let t = 0; t < MAX_TRIES; t++) {
    const N_ops = eqCount >= 2 ? randInt(1, 2) : randInt(1, 3);
    const ops   = pickOperatorsForSpec(N_ops, null);
    if (!ops) continue;

    let eq = null;
    if      (eqCount === 1) eq = _tryBuildEq1(shuffle(ops), randInt(2, 9), null);
    else if (eqCount === 2) eq = _tryBuildEq2(shuffle(ops), randInt(3, 10), null);
    else if (eqCount === 3) eq = _tryBuildEq3(shuffle(ops), randInt(4, 12), null);
    if (eq) return eq;
  }

  if (eqCount === 3) return '3+4=7=7=7';
  return eqCount === 2 ? '3+4=7=7' : '3×4=12';
}

// ================================================================
// SECTION H — SELF-TEST RUNNER
// ================================================================

function _runSelfTests() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  equationConstructors.js v7.2 — Self-Test Runner');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Unit tests for countBinaryMinusOps ──
  const binaryTests = [
    { eq: '3+4=7',           expected: 0, label: 'no minus' },
    { eq: '10-3=7',          expected: 1, label: 'one binary minus' },
    { eq: '-4+8=4',          expected: 0, label: 'unary minus only (not counted)' },
    { eq: '-4-8=-12',        expected: 1, label: 'unary + binary → 1 binary' },
    { eq: '12-4-3=5',        expected: 2, label: 'two binary minuses' },
    { eq: '-12=-4-8',        expected: 1, label: 'lhs unary, rhs binary' },
    { eq: '5-2=3=3',         expected: 1, label: 'eqCount=2 one binary' },
    { eq: '-5-2=-7=-7',      expected: 1, label: 'eqCount=2 unary+binary' },
    { eq: '-3×4=-12',        expected: 0, label: 'unary on × expr' },
    { eq: '-8÷2=-4',         expected: 0, label: 'unary on ÷ expr' },
    // v7.2 tight-budget examples
    { eq: '-3+4-2=-1',       expected: 2, label: '8-tile 3-op tight budget example' },
    { eq: '3+2-6=-1',        expected: 2, label: 'tight: no leading neg, neg result' },
  ];

  let unitPass = 0, unitFail = 0;
  for (const { eq, expected, label } of binaryTests) {
    const got = countBinaryMinusOps(eq);
    const ok  = got === expected;
    console.log(`  [countBinaryMinus] ${ok ? '✅' : '❌'} "${eq}" → ${got} (expected ${expected}) — ${label}`);
    ok ? unitPass++ : unitFail++;
  }

  // ── Unit tests for _negTileCount ──
  const negTileTests = [
    { val: 5,   expected: 1, label: 'single digit' },
    { val: 12,  expected: 2, label: 'two digits' },
    { val: -5,  expected: 2, label: 'negative single digit' },
    { val: -12, expected: 3, label: 'negative two digits' },
    { val: 0,   expected: 1, label: 'zero' },
  ];

  for (const { val, expected, label } of negTileTests) {
    const got = _negTileCount(val);
    const ok  = got === expected;
    console.log(`  [_negTileCount]    ${ok ? '✅' : '❌'} ${val} → ${got} (expected ${expected}) — ${label}`);
    ok ? unitPass++ : unitFail++;
  }

  console.log(`\n  Unit tests: ${unitPass} passed, ${unitFail} failed\n`);

  // ── distributeTileBudget tight-budget tests ──
  console.log('  distributeTileBudget tight-budget tests:');
  const tightTests = [
    { total: 4, nSlots: 5, label: '8-tile 3-op: numBudget=4 nSlots=5 (should succeed now)' },
    { total: 3, nSlots: 5, label: 'total=3 nSlots=5 (should fail)' },
    { total: 5, nSlots: 5, label: 'exact fit (should succeed)' },
  ];
  for (const { total, nSlots, label } of tightTests) {
    const result = distributeTileBudget(total, nSlots);
    console.log(`  [distributeTileBudget] total=${total} nSlots=${nSlots} → ${result ? 'OK ' + JSON.stringify(result) : 'null'} — ${label}`);
  }

  // ── Consistency check ──
  console.log('\n  Consistency: countBinaryMinusOps + countUnaryNegs = countMinusOps');
  const consistencyTests = [
    '-4-8=-12', '3+4=7', '-5+3=-2', '10-3=7=7', '-4+8=4=-4+8', '12-3-2=7',
    '-3×4=-12', '-8÷2=-4', '-3+4-2=-1',
  ];
  let consPass = 0, consFail = 0;
  for (const eq of consistencyTests) {
    const binary = countBinaryMinusOps(eq);
    const unary  = countUnaryNegs(eq);
    const total  = countMinusOps(eq);
    const ok     = binary + unary === total;
    console.log(`  ${ok ? '✅' : '❌'} "${eq}" → binary=${binary} unary=${unary} total=${total}`);
    ok ? consPass++ : consFail++;
  }

  console.log(`\n  Consistency: ${consPass} passed, ${consFail} failed`);
  console.log('\n═══════════════════════════════════════════════════════\n');
}

if (typeof process !== 'undefined' &&
    typeof import.meta !== 'undefined' &&
    import.meta.url &&
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  _runSelfTests();
}