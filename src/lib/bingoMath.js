// ================================================================
//  A-MATH BINGO — Math Utilities  (bingoMath.js)
//
//  Pure mathematical helpers used by the generator.
//  No imports from local files — zero dependencies.
// ================================================================

// ── Core operator / result constants ─────────────────────────────────────────
export const OPS_ALL    = ['+', '-', '×', '÷'];
export const RESULT_MIN = 0;
export const RESULT_MAX = 1000000;

/** Maximum '=' signs supported by the generator (all modes). */
export const EQ_MAX = 3;

// ── Generic utilities ─────────────────────────────────────────────────────────

export function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

/**
 * toRange(v) — normalise a constraint value to [lo, hi] or null.
 * Handles: null/undefined → null, number → [n,n], [lo,hi] → validated pair.
 * Guards against NaN/undefined array entries (returns null).
 */
export function toRange(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? [v, v] : null;
  if (Array.isArray(v)) {
    const lo = Number(v[0]), hi = Number(v[1]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return [lo, hi];
  }
  return null;
}

export function inRange(val, range) {
  if (!range) return true;
  return val >= range[0] && val <= range[1];
}

export function sumCounts(counts) {
  let s = 0;
  for (const v of Object.values(counts)) s += v;
  return s;
}

export function inc(counts, k, n = 1) { counts[k] = (counts[k] || 0) + n; }

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = 0 | (Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function weightedSample(items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function randInt(lo, hi) {
  return lo + (0 | (Math.random() * (hi - lo + 1)));
}

export function safeApplyOp(a, op, b) {
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

export function safeEvalL2R(nums, ops) {
  let v = nums[0];
  for (let i = 0; i < ops.length; i++) {
    const next = safeApplyOp(v, ops[i], nums[i + 1]);
    if (next === null) return null;
    v = next;
  }
  return v;
}

// ── Arithmetic evaluators ─────────────────────────────────────────────────────

/** Standard-precedence evaluator (× ÷ before + −). Returns integer or null. */
export function evalExpr(expr) {
  const toks = expr.match(/\d+|[+×÷-]/g);
  if (!toks || toks.length === 0) return null;
  if (toks.length % 2 === 0) return null;

  const nums = [];
  const ops  = [];
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

  const pNums = [nums[0]];
  const pOps  = [];
  for (let i = 0; i < ops.length; i++) {
    const op    = ops[i];
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

  let v = pNums[0];
  for (let i = 0; i < pOps.length; i++) {
    const op = pOps[i];
    const r  = pNums[i + 1];
    if (op === '+') v += r;
    else if (op === '-') v -= r;
    else return null;
  }
  return v;
}

// ─── Rational arithmetic helpers (for player validation with ÷) ──────────────
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

export function evalExprRational(expr) {
  const toks = expr.match(/\d+|[+×÷-]/g);
  if (!toks || toks.length === 0) return null;
  if (toks.length % 2 === 0) return null;

  const nums = [];
  const ops  = [];
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

  const pNums = [nums[0]];
  const pOps  = [];
  for (let i = 0; i < ops.length; i++) {
    const op    = ops[i];
    const right = nums[i + 1];
    const left  = pNums[pNums.length - 1];
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

  let v = pNums[0];
  for (let i = 0; i < pOps.length; i++) {
    const op = pOps[i];
    const r  = pNums[i + 1];
    if (op === '+') v = _frac(v.n * r.d + r.n * v.d, v.d * r.d);
    else if (op === '-') v = _frac(v.n * r.d - r.n * v.d, v.d * r.d);
    else return null;
    if (!v) return null;
  }
  return v;
}

// ── Equation utilities ────────────────────────────────────────────────────────

export function tokenizeEquation(eq) {
  const toks = eq.match(/\d+|[+×÷=-]/g);
  return toks || null;
}

/**
 * isValidEquation(eq, requiredEquals, checkRange)
 *
 * Validates that `eq` is arithmetically correct with exactly `requiredEquals`
 * '=' signs. Use checkRange=false for rational (division) validation.
 */
export function isValidEquation(eq, requiredEquals, checkRange = true) {
  const parts = eq.split('=');
  if (parts.length - 1 !== requiredEquals) return false;
  if (parts.some(p => p.length === 0)) return false;

  if (checkRange) {
    const vals = parts.map(evalExpr);
    if (vals.some(v => v === null)) return false;
    if (!vals.every(v => v >= RESULT_MIN && v <= RESULT_MAX)) return false;
    return vals.every(v => v === vals[0]);
  } else {
    const vals = parts.map(evalExprRational);
    if (vals.some(v => v === null)) return false;
    return vals.every(v => v.n === vals[0].n && v.d === vals[0].d);
  }
}

// ── Difficulty score ──────────────────────────────────────────────────────────

/** scoreEquationDifficulty(eq) — returns 1–10. */
export function scoreEquationDifficulty(eq) {
  const toks = tokenizeEquation(eq) || [];
  let opScore = 0;
  let ops     = 0;
  let digits  = 0;
  let maxNum  = 0;

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

  const len       = toks.length;
  const sizeScore = Math.log10(maxNum + 1) * 3 + (digits >= 6 ? 2 : digits >= 4 ? 1 : 0);
  const complexity = opScore + ops * 0.8 + (len >= 11 ? 2 : len >= 9 ? 1 : 0) + sizeScore;
  const raw = Math.round(1 + (complexity / 6.5) * 9);
  return clamp(raw, 1, 10);
}

// ── Config feasibility bounds ─────────────────────────────────────────────────
// These formulas derive from the budget constraint:
//   totalTile >= 2*N_ops + 2*eqCount + 1

/**
 * maxFeasibleOps(totalTile, minEqCount)
 * Upper bound on operator count given tile count and minimum equal signs.
 */
export function maxFeasibleOps(totalTile, minEqCount = 1) {
  return Math.max(0, Math.floor((totalTile - 1 - 2 * minEqCount) / 2));
}

/**
 * maxFeasibleEqs(totalTile, minOpCount)
 * Upper bound on equal-sign count given tile count and minimum operators.
 */
export function maxFeasibleEqs(totalTile, minOpCount = 1) {
  return Math.max(1, Math.floor((totalTile - 1 - 2 * minOpCount) / 2));
}
