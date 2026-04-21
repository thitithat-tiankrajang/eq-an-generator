// ================================================================
//  configValidator.js
//  Config validation, feasibility checks, and constraint analysis.
// ================================================================

import { OPS_ALL, toRange, clamp, randInt } from './bingoMath.js';
import { HEAVY_LIST } from './tileHelpers.js';
import { POOL_DEF } from './equationConstructors.js';

// FIX: EQ_MAX raised from 2 → 3 to support equalCount up to 3.
export const EQ_MAX_LOCAL = 3;

// ── equalCount resolver ───────────────────────────────────────────────────────

export function resolveEqualCount(mode, cfg) {
  const range = toRange(cfg.equalCount);
  if (!range) {
    return mode === 'expand' ? (Math.random() < 0.8 ? 2 : 1) : 1;
  }
  const lo = clamp(range[0], 1, EQ_MAX_LOCAL);
  const hi = clamp(range[1], 1, EQ_MAX_LOCAL);
  if (lo === hi) return lo;
  return randInt(lo, hi);
}

// ── Basic config validation ───────────────────────────────────────────────────

export function validateConfig(cfg) {
  const { mode, totalTile } = cfg;
  if (!['cross', 'expand', 'plain'].includes(mode))
    throw new Error('mode must be "cross", "expand", or "plain"');
  if (totalTile < 8 || totalTile > 15)
    throw new Error('totalTile must be 8–15');
  if (mode === 'expand' && totalTile < 11)
    throw new Error('Expand mode requires totalTile ≥ 11');

  const eqRange = toRange(cfg.equalCount);
  if (eqRange) {
    const [eqLo, eqHi] = eqRange;
    if (eqLo < 1)
      throw new Error(`จำนวนเครื่องหมาย = ต้องมีอย่างน้อย 1 ตัว`);
    if (eqHi > EQ_MAX_LOCAL)
      throw new Error(`จำนวนเครื่องหมาย = สูงสุด ${EQ_MAX_LOCAL} ตัว`);
    if (eqLo > eqHi)
      throw new Error(`equalCount: min (${eqLo}) มากกว่า max (${eqHi})`);

    const opRange = toRange(cfg.operatorCount);
    const minOps = opRange ? opRange[0] : 0;
    const minNeeded = 2 * minOps + 2 * eqLo + 1;
    if (totalTile < minNeeded) {
      throw new Error(
        `เครื่องหมาย = เกิน: ต้องการอย่างน้อย ${minNeeded} tiles ` +
        `สำหรับ ${eqLo} เครื่องหมาย = และ operator ≥${minOps} ตัว ` +
        `แต่มีเพียง ${totalTile} tiles`
      );
    }

    const poolDef = cfg.poolDef ?? POOL_DEF;
    const eqTilesInPool = poolDef['='] ?? 0;
    if (eqLo > eqTilesInPool) {
      throw new Error(
        `ต้องการเครื่องหมาย = อย่างน้อย ${eqLo} ตัว แต่ Pool มีเพียง ${eqTilesInPool} ตัว`
      );
    }
  }
}

// ── Detailed constraint validation ───────────────────────────────────────────

export function getOperatorMinMap(operatorSpec) {
  const mins = { '+': 0, '-': 0, '×': 0, '÷': 0 };
  if (!operatorSpec) return mins;
  for (const op of OPS_ALL) {
    const rr = toRange(operatorSpec[op]);
    if (!rr) continue;
    mins[op] = Math.max(0, rr[0]);
  }
  return mins;
}

export function validateDetailedConstraints(cfg) {
  const totalTile = cfg.totalTile;
  const eqRange = toRange(cfg.equalCount);
  const eqCount = eqRange ? clamp(eqRange[0], 1, EQ_MAX_LOCAL) : 1;
  const opHiClamp = Math.min(6, Math.floor((totalTile - 2 * eqCount - 1) / 2));
  const opRange = toRange(cfg.operatorCount);
  const opHi = Math.min(opHiClamp, opRange ? opRange[1] : 3);
  const mins = getOperatorMinMap(cfg.operatorSpec);
  const minRequiredOps = mins['+'] + mins['-'] + mins['×'] + mins['÷'];
  if (minRequiredOps > opHi) {
    throw new Error(
      `Operator constraints require at least ${minRequiredOps} operators, but this setup allows at most ${opHi}.`
    );
  }

  if (cfg.poolDef) {
    for (const op of OPS_ALL) {
      const need = mins[op];
      const have = cfg.poolDef[op] ?? 0;
      if (need > have) {
        throw new Error(
          `Pool constraint mismatch: requires at least ${need} '${op}' tiles, but selected tile set has ${have}.`
        );
      }
    }
  }
}

// ── Feasibility check ─────────────────────────────────────────────────────────

export function isConfigFeasible(cfg) {
  const { totalTile } = cfg;
  if (!totalTile || totalTile < 3) return false;

  const opRange   = toRange(cfg.operatorCount);
  const eqRange   = toRange(cfg.equalCount);
  const wildRange = toRange(cfg.wildcardCount ?? cfg.blankCount);

  const minOps  = opRange   ? opRange[0]                           : 0;
  const minEqs  = eqRange   ? clamp(eqRange[0], 1, EQ_MAX_LOCAL)  : 1;
  const maxWild = wildRange ? wildRange[1]                          : 0;

  if (totalTile < 2 * minOps + 2 * minEqs + 1) return false;

  if (cfg.operatorSpec) {
    const totalMin = Object.values(cfg.operatorSpec)
      .map(toRange)
      .reduce((s, r) => s + (r ? r[0] : 0), 0);
    const maxOps = opRange ? opRange[1] : Math.min(6, totalTile - minEqs - 2);
    if (totalMin > maxOps) return false;
  }

  const minNumSlots = Math.max(1, minOps + 1);
  if (maxWild > totalTile - minOps - minEqs - minNumSlots) return false;

  const poolDef = cfg.poolDef ?? POOL_DEF;
  const eqTilesAvail = poolDef['='] ?? 0;
  if (minEqs > eqTilesAvail) return false;

  return true;
}

// ── Constraint failure explanation ───────────────────────────────────────────

export function explainConstraintFailure(cfg) {
  const reasons = [];
  const totalTile = cfg.totalTile;
  const opRange   = toRange(cfg.operatorCount);
  const eqRange   = toRange(cfg.equalCount);
  const wildRange = toRange(cfg.wildcardCount ?? cfg.blankCount);
  const blankRange  = toRange(cfg.blankCount);
  const heavyRange  = toRange(cfg.heavyCount);

  const minOps  = opRange   ? opRange[0]                           : 0;
  const maxOps  = opRange   ? opRange[1]                           : 3;
  const minEq   = eqRange   ? clamp(eqRange[0], 1, EQ_MAX_LOCAL)  : 1;
  const minWild = wildRange ? wildRange[0]                          : 0;
  const minBlank = blankRange ? blankRange[0]                       : 0;
  const minHeavy = heavyRange ? heavyRange[0]                       : 0;

  const opHiClampAtMinEq = Math.min(6, Math.floor((totalTile - 2 * minEq - 1) / 2));
  if (minOps > opHiClampAtMinEq) {
    reasons.push(
      `operatorCount.min=${minOps} too high for totalTile=${totalTile} (max feasible ${opHiClampAtMinEq} when equalCount=${minEq}).`
    );
  }
  if (totalTile < 2 * minOps + 2 * minEq + 1) {
    reasons.push(
      `เครื่องหมาย = เกิน: ต้องการ ${2 * minOps + 2 * minEq + 1} tiles ` +
      `(= ${minEq} ตัว + operator ${minOps} ตัว) แต่มีเพียง ${totalTile} tiles`
    );
  }
  if (minWild > totalTile - minOps - minEq - Math.max(1, minOps + 1)) {
    reasons.push(
      `wildcard/blank minimum (${minWild}) leaves insufficient number slots for a valid equation.`
    );
  }

  if (cfg.operatorSpec) {
    const mins = getOperatorMinMap(cfg.operatorSpec);
    const minCoreOps = mins['+'] + mins['-'] + mins['×'] + mins['÷'];
    if (minCoreOps > maxOps) {
      reasons.push(
        `operatorSpec minimum requires ${minCoreOps} core operators but operatorCount.max is ${maxOps}.`
      );
    }
  }

  if (cfg.poolDef) {
    const pool = cfg.poolDef;
    if (minEq   > (pool['='] ?? 0)) reasons.push(`pool has '=' only ${pool['='] ?? 0}, but equalCount needs at least ${minEq}.`);
    if (minBlank > (pool['?'] ?? 0)) reasons.push(`pool has '?' only ${pool['?'] ?? 0}, but blankCount.min is ${minBlank}.`);
    const heavyPool = HEAVY_LIST.reduce((s, h) => s + (pool[h] ?? 0), 0);
    if (minHeavy > heavyPool) reasons.push(`pool heavy tiles total ${heavyPool}, but heavyCount.min is ${minHeavy}.`);
    if (cfg.operatorSpec) {
      const mins = getOperatorMinMap(cfg.operatorSpec);
      for (const op of OPS_ALL) {
        if (mins[op] > (pool[op] ?? 0)) {
          reasons.push(`pool has '${op}' only ${pool[op] ?? 0}, but operatorSpec requires at least ${mins[op]}.`);
        }
      }
    }
    const poolWilds = (pool['?'] ?? 0) + (pool['+/-'] ?? 0) + (pool['×/÷'] ?? 0);
    if (minWild > poolWilds) {
      reasons.push(`pool wildcard tiles total ${poolWilds}, but wildcard minimum is ${minWild}.`);
    }
  }

  if (!reasons.length) {
    reasons.push(
      'search exhausted: constraints appear feasible but no valid equation found within retry limits (likely very tight combination).'
    );
  }
  return reasons.join(' ');
}

// ── Config sanitizer for fallback ─────────────────────────────────────────────

export function sanitizeConfigForFallback(cfg) {
  const eqRange = toRange(cfg.equalCount);
  const safeEqCount = eqRange ? clamp(eqRange[0], 1, EQ_MAX_LOCAL) : 1;

  return {
    mode: cfg.mode,
    totalTile: cfg.totalTile,
    operatorCount: safeEqCount >= 3 ? [0, 2] : [1, 1],
    equalCount: [safeEqCount, safeEqCount],
    wildcardCount: 0,
    blankCount: 0,
    heavyCount: null,
    operatorSpec: null,
    tileAssignmentSpec: null,
    poolDef: cfg.poolDef ?? POOL_DEF,
    noBonus: cfg.noBonus ?? false,
  };
}
