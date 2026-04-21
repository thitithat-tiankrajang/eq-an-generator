// ================================================================
//  equationConstructors.js
//  Budget-based equation construction (v6.2 algorithm, no DFS).
//  Owns: POOL_DEF, all equation builder/constructor functions.
// ================================================================

import {
  OPS_ALL, RESULT_MIN, RESULT_MAX,
  clamp, toRange, randInt, shuffle, weightedSample,
  evalExpr, evalExprRational, isValidEquation,
} from './bingoMath.js';

import {
  numTiles, equationToTileCounts, sumCounts,
} from './tileHelpers.js';

// ── Tile pool definition ──────────────────────────────────────────────────────
export const POOL_DEF = {
  '0':0, '1':4, '2':4, '3':4, '4':4, '5':4, '6':4, '7':4, '8':4, '9':4,
  '10':1,'11':1,'12':1,'13':1,'14':1,'15':1,'16':1,'17':1,'18':1,'19':1,'20':1,
  '+':4, '-':4, '×':4, '÷':4, '+/-':4, '×/÷':4, '=':8, '?':2,
};

// ── Internal numeric helpers ──────────────────────────────────────────────────

// BUGFIX: pickNumForBudget(2) could return 20 which is a heavy tile.
// Fixed range to 21-99 for budget=2.
function pickNumForBudget(budget) {
  if (budget === 1) return randInt(1, 20);
  if (budget === 2) return randInt(21, 99);
  if (budget === 3) return randInt(100, 200);
  return randInt(1, 9);
}

function distributeTileBudget(total, nSlots) {
  if (nSlots <= 0 || total < nSlots || total > 3 * nSlots) return null;
  const b = Array(nSlots).fill(1);
  let rem = total - nSlots;
  const order = shuffle(Array.from({ length: nSlots }, (_, i) => i));
  let oi = 0;
  while (rem > 0) {
    const i = order[oi % order.length];
    if (b[i] < 3) { b[i]++; rem--; }
    oi++;
    if (oi > nSlots * 3) break;
  }
  return rem === 0 ? b : null;
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
      const effectiveMax = Math.max(rr[0], rr[1]);
      return ops.filter(o => o === op).length < effectiveMax;
    });
    if (!avail.length) return null;
    ops.push(weightedSample(avail, avail.map(o => {
      if (o === '+' || o === '×') return 5;
      if (o === '-') return 3;
      return 2;
    })));
  }

  return ops.slice(0, N);
}

function buildExprStr(nums, ops) {
  let s = String(nums[0]);
  for (let i = 0; i < ops.length; i++) s += ops[i] + String(nums[i + 1]);
  return s;
}

// ── eqCount=1 builders ────────────────────────────────────────────────────────

// BUGFIX: Added backward-solve path for ÷ — forward (pick nums → compute result)
// has near-zero hit rate for ÷ because random a÷b rarely yields integer.
function tryBuildEq1Forward(lhsOps, numBudget) {
  const KL = lhsOps.length + 1;
  const budgets = distributeTileBudget(numBudget, KL + 1);
  if (!budgets) return null;

  const lhsBudgets = budgets.slice(0, KL);
  const resultBudget = budgets[KL];

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

  const lhsNums = lhsBudgets.map(b => pickNumForBudget(b));
  const lhsExpr = buildExprStr(lhsNums, lhsOps);
  const lhsVal = evalExpr(lhsExpr);
  if (lhsVal === null || lhsVal < RESULT_MIN || lhsVal > RESULT_MAX) return null;
  if (numTiles(lhsVal) !== resultBudget) return null;

  const eq = lhsExpr + '=' + lhsVal;
  return isValidEquation(eq, 1) ? eq : null;
}

function tryBuildEq1Flip(rhsOps, numBudget) {
  const KR = rhsOps.length + 1;
  const budgets = distributeTileBudget(numBudget, KR + 1);
  if (!budgets) return null;

  const resultBudget = budgets[0];
  const rhsBudgets = budgets.slice(1);

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

  const rhsNums = rhsBudgets.map(b => pickNumForBudget(b));
  const rhsExpr = buildExprStr(rhsNums, rhsOps);
  const rhsVal = evalExpr(rhsExpr);
  if (rhsVal === null || rhsVal < RESULT_MIN || rhsVal > RESULT_MAX) return null;
  if (numTiles(rhsVal) !== resultBudget) return null;

  const eq = rhsVal + '=' + rhsExpr;
  return isValidEquation(eq, 1) ? eq : null;
}

function tryBuildEq1Balanced(lhsOps, rhsOps, numBudget) {
  const KL = lhsOps.length + 1;
  const KR = rhsOps.length + 1;

  if (numBudget < KL + KR || numBudget > 3 * (KL + KR)) return null;

  const lhsMax = Math.min(3 * KL, numBudget - KR);
  const lhsMin = Math.max(KL, numBudget - 3 * KR);
  if (lhsMin > lhsMax) return null;
  const lhsBudgetTotal = lhsMin + (0 | (Math.random() * (lhsMax - lhsMin + 1)));
  const rhsBudgetTotal = numBudget - lhsBudgetTotal;

  const lhsBudgets = distributeTileBudget(lhsBudgetTotal, KL);
  if (!lhsBudgets) return null;

  const lhsNums = lhsBudgets.map(b => pickNumForBudget(b));
  const lhsExpr = buildExprStr(lhsNums, lhsOps);
  const lhsValR = evalExprRational(lhsExpr);
  if (!lhsValR) return null;
  const lhsValNum = lhsValR.n / lhsValR.d;
  if (lhsValNum < RESULT_MIN || lhsValNum > RESULT_MAX) return null;

  if (KR === 2 && rhsBudgetTotal >= 2 && lhsValR.d === 1) {
    const lhsVal = lhsValR.n;
    const rhsOp = rhsOps[0];
    const freeBudget = Math.max(1, rhsBudgetTotal - 1);
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
            const constrainedNum = pickNumForBudget(constrainedBudget);
            if (numTiles(constrainedNum) !== constrainedBudget) continue;
            const rhsExpr = `${constrainedNum}×0`;
            const rhsValR2 = evalExprRational(rhsExpr);
            if (rhsValR2 && rhsValR2.n === lhsValR.n && rhsValR2.d === lhsValR.d) {
              const eq = lhsExpr + '=' + rhsExpr;
              if (isValidEquation(eq, 1, false)) return eq;
            }
          }
          continue;
        }
        if (lhsVal % freeNum !== 0) continue;
        const constrainedNum = lhsVal / freeNum;
        if (constrainedNum < 0 || constrainedNum > RESULT_MAX) continue;
        if (numTiles(constrainedNum) !== constrainedBudget) continue;
        if (numTiles(freeNum) !== freeBudget) continue;
        const rhsExpr = `${freeNum}×${constrainedNum}`;
        const rhsValR2 = evalExprRational(rhsExpr);
        if (rhsValR2 && rhsValR2.n === lhsValR.n && rhsValR2.d === lhsValR.d) {
          const eq = lhsExpr + '=' + rhsExpr;
          if (isValidEquation(eq, 1, false)) return eq;
        }
      }
    } else {
      const freeNum = pickNumForBudget(Math.min(freeBudget, 3));
      let constrainedNum = null;
      if (rhsOp === '+') constrainedNum = lhsVal - freeNum;
      else if (rhsOp === '-') constrainedNum = lhsVal + freeNum;

      if (
        constrainedNum !== null &&
        constrainedNum >= 0 &&
        constrainedNum <= RESULT_MAX &&
        numTiles(constrainedNum) === constrainedBudget
      ) {
        let rhsExpr;
        if (rhsOp === '+') {
          rhsExpr = `${freeNum}${rhsOp}${constrainedNum}`;
        } else {
          rhsExpr = `${constrainedNum}${rhsOp}${freeNum}`;
        }

        const rhsValR2 = evalExprRational(rhsExpr);
        if (rhsValR2 && rhsValR2.n === lhsValR.n && rhsValR2.d === lhsValR.d) {
          const eq = lhsExpr + '=' + rhsExpr;
          if (isValidEquation(eq, 1, false)) return eq;
        }
      }
    }
  }

  const rhsBudgets = distributeTileBudget(rhsBudgetTotal, KR);
  if (!rhsBudgets) return null;
  const rhsNums = rhsBudgets.map(b => pickNumForBudget(b));
  const rhsExpr2 = buildExprStr(rhsNums, rhsOps);
  const rhsVal2R = evalExprRational(rhsExpr2);
  if (!rhsVal2R || rhsVal2R.n !== lhsValR.n || rhsVal2R.d !== lhsValR.d) return null;

  const eq = lhsExpr + '=' + rhsExpr2;
  return isValidEquation(eq, 1, false) ? eq : null;
}

function tryBuildEq1FractionAddSub(ops, numBudget) {
  if (ops.length !== 3) return null;
  const divN = ops.filter(o => o === '÷').length;
  const hasAddSub = ops.includes('+') || ops.includes('-');
  if (divN < 2 || !hasAddSub) return null;

  const pmOp = ops.includes('-') ? '-' : '+';

  const gcd = (a, b) => {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  };
  const pickReducedFraction = (nb, db) => {
    for (let i = 0; i < 120; i++) {
      const n = pickNumForBudget(nb);
      const d = pickNumForBudget(db);
      if (d <= 1) continue;
      if (n % d === 0) continue;
      if (gcd(n, d) !== 1) continue;
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
        const eq = `${a}÷${b}${pmOp}${c}÷${d}=${rhs}`;
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
        const c = pickNumForBudget(cb);
        const [e, f] = fR;
        const eq = `${a}÷${b}${pmOp}${c}=${e}÷${f}`;
        if (isValidEquation(eq, 1, false)) return eq;
      }
    }
  }

  return null;
}

// ── eqCount=2 builders ────────────────────────────────────────────────────────

// BUGFIX: Added backward-solve for ÷ — original forward construction fails for ÷.
function tryBuildChainEq2(ops, numBudget) {
  const KL = ops.length + 1;

  if (ops.length === 1 && ops[0] === '÷') {
    for (let vBudget = 1; vBudget <= 2; vBudget++) {
      const lhsTotal = numBudget - 2 * vBudget;
      if (lhsTotal < KL || lhsTotal > 3 * KL) continue;

      const lhsBudgets = distributeTileBudget(lhsTotal, KL);
      if (!lhsBudgets) continue;

      for (let attempt = 0; attempt < 30; attempt++) {
        const V = pickNumForBudget(vBudget);
        if (V < RESULT_MIN || V > RESULT_MAX) continue;
        if (numTiles(V) !== vBudget) continue;
        const b = pickNumForBudget(lhsBudgets[1]);
        if (b === 0) continue;
        const a = V * b;
        if (a < 0 || a > RESULT_MAX) continue;
        if (numTiles(a) !== lhsBudgets[0]) continue;
        if (numTiles(b) !== lhsBudgets[1]) continue;
        const eq = `${a}÷${b}=${V}=${V}`;
        if (isValidEquation(eq, 2)) return eq;
      }
    }
    return null;
  }

  // For ÷-containing multi-op ops the forward hit rate is ~15-20%.
  // Use backward-solve (construct lhsExpr targeting V directly) instead.
  const hasDivInOps = ops.includes('÷');
  const CHAIN_TRIES = hasDivInOps ? 50 : 15;

  for (let vBudget = 1; vBudget <= 2; vBudget++) {
    const lhsTotal = numBudget - 2 * vBudget;
    if (lhsTotal < KL || lhsTotal > 3 * KL) continue;

    if (hasDivInOps) {
      for (let vAttempt = 0; vAttempt < 40; vAttempt++) {
        const V = pickNumForBudget(vBudget);
        if (V < RESULT_MIN || V > RESULT_MAX || numTiles(V) !== vBudget) continue;
        const lhsExpr = _buildExprForTarget(V, ops, lhsTotal);
        if (!lhsExpr) continue;
        const eq = `${lhsExpr}=${V}=${V}`;
        if (isValidEquation(eq, 2)) return eq;
      }
    }

    for (let attempt = 0; attempt < CHAIN_TRIES; attempt++) {
      const lhsBudgets = distributeTileBudget(lhsTotal, KL);
      if (!lhsBudgets) break;
      const lhsNums = lhsBudgets.map(b => pickNumForBudget(b));
      const v = evalExpr(buildExprStr(lhsNums, ops));
      if (v === null || v < RESULT_MIN || v > RESULT_MAX) continue;
      if (numTiles(v) !== vBudget) continue;
      const eq = buildExprStr(lhsNums, ops) + '=' + v + '=' + v;
      if (isValidEquation(eq, 2)) return eq;
    }
  }
  return null;
}

function tryBuildThreeWayEq2(lhsOps, rhsOps, numBudget) {
  const KL = lhsOps.length + 1;
  const KR = rhsOps.length + 1;
  const Ktotal = KL + KR + 1;

  const budgets = distributeTileBudget(numBudget, Ktotal);
  if (!budgets) return null;

  const lhsBudgets = budgets.slice(0, KL);
  const rhsBudgets = budgets.slice(KL, KL + KR);
  const vBudget    = budgets[KL + KR];

  const lhsNums = lhsBudgets.map(b => pickNumForBudget(b));
  const rhsNums = rhsBudgets.map(b => pickNumForBudget(b));

  const lhsVal = evalExpr(buildExprStr(lhsNums, lhsOps));
  const rhsVal = evalExpr(buildExprStr(rhsNums, rhsOps));

  if (lhsVal === null || rhsVal === null) return null;
  if (lhsVal !== rhsVal) return null;
  if (lhsVal < RESULT_MIN || lhsVal > RESULT_MAX) return null;
  if (numTiles(lhsVal) !== vBudget) return null;

  const eq = buildExprStr(lhsNums, lhsOps) + '=' +
             buildExprStr(rhsNums, rhsOps) + '=' +
             lhsVal;
  return isValidEquation(eq, 2) ? eq : null;
}

// ── eqCount=3 builders ────────────────────────────────────────────────────────

// v6.2: increased from 30 → 60 attempts for better ÷ hit rate on tight budgets.
function _buildExprForTarget(V, ops, numBudgetTotal) {
  const K = ops.length + 1;
  if (numBudgetTotal < K || numBudgetTotal > 3 * K) return null;

  if (ops.length === 0) {
    if (numTiles(V) === numBudgetTotal && V >= 0 && V <= RESULT_MAX) return String(V);
    return null;
  }

  if (ops.length === 1) {
    const op = ops[0];
    const budgets = distributeTileBudget(numBudgetTotal, 2);
    if (!budgets) return null;
    const [bA, bB] = budgets;

    for (let attempt = 0; attempt < 60; attempt++) {
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
      if (a < 0 || b < 0) continue;
      if (a > RESULT_MAX || b > RESULT_MAX) continue;
      if (numTiles(a) !== bA || numTiles(b) !== bB) continue;

      const expr = `${a}${op}${b}`;
      if (evalExpr(expr) === V) return expr;
    }
    return null;
  }

  const budgets = distributeTileBudget(numBudgetTotal, K);
  if (!budgets) return null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const nums = budgets.map(b => pickNumForBudget(b));
    const expr = buildExprStr(nums, ops);
    if (evalExpr(expr) === V) return expr;
  }

  return null;
}

// v6.2: Added Pattern D — exhaustive algebraic search for single-operator
// tight-budget cases, guaranteeing generation when valid equations exist.
// Zero-operator fallback iterates vb values explicitly.
function _tryBuildEq3(ops, numBudget) {
  const N = ops.length;
  const MAX_OUTER = 60;

  for (let outer = 0; outer < MAX_OUTER; outer++) {
    const vBudget = Math.random() < 0.75 ? 1 : 2;
    const V = vBudget === 1 ? randInt(1, 20) : randInt(21, 99);
    if (V < RESULT_MIN || V > RESULT_MAX) continue;
    if (numTiles(V) !== vBudget) continue;

    // Pattern A: allOpsExpr = V = V = V
    {
      const exprBudget = numBudget - 3 * vBudget;
      if (exprBudget >= (N + 1) && exprBudget <= 3 * (N + 1)) {
        const expr = _buildExprForTarget(V, ops, exprBudget);
        if (expr) {
          const eq = `${expr}=${V}=${V}=${V}`;
          if (isValidEquation(eq, 3)) return eq;
        }
      }
    }

    // Pattern B: expr1 = expr2 = V = V  (N >= 1)
    if (N >= 1) {
      const splitPoints = N === 1 ? [1] : shuffle(Array.from({ length: N - 1 }, (_, i) => i + 1)).slice(0, 3);
      for (const splitAt of splitPoints) {
        const lhsOps = ops.slice(0, splitAt);
        const rhsOps = ops.slice(splitAt);
        const KL = lhsOps.length + 1;
        const KR = rhsOps.length + 1;
        const exprTotal = numBudget - 2 * vBudget;
        const minLhs = KL;
        const maxLhs = Math.min(3 * KL, exprTotal - KR);
        const minRhs = KR;
        if (maxLhs < minLhs || exprTotal - maxLhs < minRhs) continue;

        for (let budgetTry = 0; budgetTry < 5; budgetTry++) {
          const lhsBudgetTotal = randInt(minLhs, maxLhs);
          const rhsBudgetTotal = exprTotal - lhsBudgetTotal;
          if (rhsBudgetTotal < KR || rhsBudgetTotal > 3 * KR) continue;
          const lhsExpr = _buildExprForTarget(V, lhsOps, lhsBudgetTotal);
          if (!lhsExpr) continue;
          const rhsExpr = _buildExprForTarget(V, rhsOps, rhsBudgetTotal);
          if (!rhsExpr) continue;
          const eq = `${lhsExpr}=${rhsExpr}=${V}=${V}`;
          if (isValidEquation(eq, 3)) return eq;
        }
      }
    }

    // Pattern C: expr1 = expr2 = expr3 = V  (N >= 2)
    if (N >= 2) {
      for (let splitTry = 0; splitTry < 4; splitTry++) {
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
        const minTotal = K1 + K2 + K3;
        const maxTotal = 3 * (K1 + K2 + K3);
        if (exprTotal < minTotal || exprTotal > maxTotal) continue;

        for (let bt = 0; bt < 5; bt++) {
          const b1 = randInt(K1, Math.min(3 * K1, exprTotal - K2 - K3));
          const remain = exprTotal - b1;
          const b2 = randInt(K2, Math.min(3 * K2, remain - K3));
          const b3 = remain - b2;
          if (b3 < K3 || b3 > 3 * K3) continue;
          const e1 = _buildExprForTarget(V, ops1, b1);
          if (!e1) continue;
          const e2 = _buildExprForTarget(V, ops2, b2);
          if (!e2) continue;
          const e3 = _buildExprForTarget(V, ops3, b3);
          if (!e3) continue;
          const eq = `${e1}=${e2}=${e3}=${V}`;
          if (isValidEquation(eq, 3)) return eq;
        }
      }
    }
  }

  // Pattern D: exhaustive algebraic search for single-operator tight-budget cases.
  // Iterates ALL valid V values — guarantees finding a solution when one exists.
  if (N >= 1) {
    for (let vb = 1; vb <= 2; vb++) {
      const eb = numBudget - 3 * vb;
      if (eb < (N + 1) || eb > 3 * (N + 1)) continue;

      const vLo = vb === 1 ? RESULT_MIN : 10;
      const vHi = vb === 1 ? 20 : Math.min(99, RESULT_MAX);

      const vCandidates = [];
      for (let v = vLo; v <= vHi; v++) {
        if (numTiles(v) === vb) vCandidates.push(v);
      }
      shuffle(vCandidates);

      for (const V of vCandidates) {
        const expr = _buildExprForTarget(V, ops, eb);
        if (expr) {
          const eq = `${expr}=${V}=${V}=${V}`;
          if (isValidEquation(eq, 3)) return eq;
        }

        if (N >= 2) {
          const splitAt = 1 + (0 | (Math.random() * (N - 1)));
          const lOps = ops.slice(0, splitAt);
          const rOps = ops.slice(splitAt);
          const KL = lOps.length + 1;
          const KR = rOps.length + 1;
          const exprTotal = numBudget - 2 * vb;
          const minL = KL;
          const maxL = Math.min(3 * KL, exprTotal - KR);
          if (maxL >= minL) {
            for (let lBudget = minL; lBudget <= maxL; lBudget++) {
              const rBudget = exprTotal - lBudget;
              if (rBudget < KR || rBudget > 3 * KR) continue;
              const le = _buildExprForTarget(V, lOps, lBudget);
              if (!le) continue;
              const re = _buildExprForTarget(V, rOps, rBudget);
              if (!re) continue;
              const eq = `${le}=${re}=${V}=${V}`;
              if (isValidEquation(eq, 3)) return eq;
            }
          }
        }
      }
    }
  }

  // Fallback: 0-operator chain V=V=V=V
  if (N === 0) {
    for (let vb = 1; vb <= 3; vb++) {
      if (4 * vb !== numBudget) continue;
      for (let attempt = 0; attempt < 30; attempt++) {
        const V = pickNumForBudget(vb);
        if (V < RESULT_MIN || V > RESULT_MAX) continue;
        if (numTiles(V) !== vb) continue;
        const eq = `${V}=${V}=${V}=${V}`;
        if (isValidEquation(eq, 3)) return eq;
      }
    }
  }

  return null;
}

// ── Top-level equation constructors ──────────────────────────────────────────

export function constructEquationV6(N_ops, eqCount, targetTile, opSpec, poolDef = POOL_DEF) {
  const MAX_TRIES = eqCount >= 3 ? 150 : (targetTile <= 11 ? 70 : 120);

  const numBudget = targetTile - eqCount - N_ops;
  const numSlots = N_ops + eqCount + 1;
  if (numBudget < numSlots || numBudget > 3 * numSlots) return null;

  for (let t = 0; t < MAX_TRIES; t++) {
    const ops = pickOperatorsForSpec(N_ops, opSpec);
    if (!ops) continue;

    const opsShuffled = shuffle([...ops]);
    let eq = null;

    if (eqCount === 1)      eq = _tryBuildEq1(opsShuffled, numBudget, opSpec, poolDef);
    else if (eqCount === 2) eq = _tryBuildEq2(opsShuffled, numBudget);
    else if (eqCount === 3) eq = _tryBuildEq3(opsShuffled, numBudget);

    if (!eq) continue;

    try {
      const tc = equationToTileCounts(eq, { preferHeavy: true });
      if (sumCounts(tc) !== targetTile) continue;
    } catch {
      continue;
    }

    return eq;
  }

  // Fallback tier 1
  const fallbackTries = eqCount >= 3 ? 80 : (targetTile <= 11 ? 35 : 60);
  for (let t = 0; t < fallbackTries; t++) {
    const simpleOps = Array(N_ops).fill('+');
    let eq = null;
    if (eqCount === 1)      eq = tryBuildEq1Forward(simpleOps, numBudget);
    else if (eqCount === 2) eq = tryBuildChainEq2(simpleOps, numBudget);
    else if (eqCount === 3) eq = _tryBuildEq3(simpleOps, numBudget);
    if (!eq) continue;
    try {
      const tc = equationToTileCounts(eq, { preferHeavy: true });
      if (sumCounts(tc) === targetTile) return eq;
    } catch { /* ignore */ }
  }

  return null;
}

function _tryBuildEq1(ops, numBudget, opSpec = null, poolDef = POOL_DEF) {
  const N = ops.length;

  const coreTotal = (poolDef['+'] || 0) + (poolDef['-'] || 0) + (poolDef['×'] || 0) + (poolDef['÷'] || 0);
  const divShare = coreTotal > 0 ? (poolDef['÷'] || 0) / coreTotal : 0;
  const pmShare  = coreTotal > 0 ? ((poolDef['+'] || 0) + (poolDef['-'] || 0)) / coreTotal : 0;
  let fracChance = clamp(divShare * pmShare * 1.2, 0.02, 0.35);
  const divMin   = toRange(opSpec?.['÷'])?.[0] ?? 0;
  const plusMin  = toRange(opSpec?.['+'])?.[0] ?? 0;
  const minusMin = toRange(opSpec?.['-'])?.[0] ?? 0;
  if (divMin >= 2 && (plusMin > 0 || minusMin > 0)) fracChance = Math.max(fracChance, 0.18);
  if (Math.random() < fracChance) {
    const fracAddSub = tryBuildEq1FractionAddSub(ops, numBudget);
    if (fracAddSub) return fracAddSub;
  }

  let style;
  if (N === 1)      style = weightedSample(['fwd','flip'],      [7, 3]);
  else if (N === 2) style = weightedSample(['fwd','flip','bal'],[4, 2, 4]);
  else              style = weightedSample(['fwd','bal'],        [4, 6]);

  if (style === 'fwd')  return tryBuildEq1Forward(ops, numBudget);
  if (style === 'flip') return tryBuildEq1Flip(ops, numBudget);

  const splitAt = 1 + (0 | (Math.random() * (N - 1)));
  const lhsOps = ops.slice(0, splitAt);
  const rhsOps = ops.slice(splitAt);
  const balanced = tryBuildEq1Balanced(lhsOps, rhsOps, numBudget);
  if (balanced) return balanced;
  return tryBuildEq1Forward(ops, numBudget);
}

function _tryBuildEq2(ops, numBudget) {
  const N = ops.length;
  const useChain = N <= 1 || Math.random() < 0.55;

  if (useChain || N < 2) return tryBuildChainEq2(ops, numBudget);

  const splitAt = 1 + (0 | (Math.random() * (N - 1)));
  const lhsOps = ops.slice(0, splitAt);
  const rhsOps = ops.slice(splitAt);
  return tryBuildThreeWayEq2(lhsOps, rhsOps, numBudget) ??
         tryBuildChainEq2(ops, numBudget);
}

export function constructEquation(eqCount, opts = {}) {
  const { targetTiles = null } = opts;

  if (targetTiles != null) {
    const N_ops = randInt(1, Math.min(3, targetTiles - eqCount - 2));
    const eq = constructEquationV6(N_ops, eqCount, targetTiles, null, POOL_DEF);
    if (eq) return eq;
  }

  const MAX_TRIES = 500;
  for (let t = 0; t < MAX_TRIES; t++) {
    const N_ops = eqCount >= 2 ? randInt(1, 2) : randInt(1, 3);
    const ops = pickOperatorsForSpec(N_ops, null);
    if (!ops) continue;

    let eq = null;
    if (eqCount === 1)      eq = _tryBuildEq1(shuffle(ops), randInt(2, 9));
    else if (eqCount === 2) eq = _tryBuildEq2(shuffle(ops), randInt(3, 10));
    else if (eqCount === 3) eq = _tryBuildEq3(shuffle(ops), randInt(4, 12));
    if (eq) return eq;
  }

  if (eqCount === 3) return '3+4=7=7=7';
  return eqCount === 2 ? '3+4=7=7' : '3×4=12';
}
