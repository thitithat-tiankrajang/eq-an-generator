// ================================================================
//  A-MATH BINGO GENERATOR  v6.2  — orchestrator
//
//  This file is responsible for the top-level generation pipeline.
//  All equation construction, DFS solving, board building, mutation,
//  and config validation live in their respective modules.
// ================================================================

// ─── Math utilities & tile helpers ────────────────────────────────────────────
import {
  OPS_ALL, toRange, clamp, randInt, shuffle, weightedSample,
  scoreEquationDifficulty, isValidEquation, evalExpr,
} from './bingoMath.js';

import {
  LIGHT_DIGS, HEAVY_LIST, HEAVY_SET, OPS_SET, WILDS_SET,
  numTiles, makeCounts,
  equationToTileCounts, equationToSourceTiles,
  analyzeCounts,
  withinPoolLimits,
  sumCounts,
} from './tileHelpers.js';

// ─── Placement pipeline ────────────────────────────────────────────────────────
import {
  selectRealisticPlacement,
  selectLockPositions,
  passesRealismFilter,
} from './crossBingoPlacement.js';

// ─── Equation construction ────────────────────────────────────────────────────
import { POOL_DEF, constructEquationV6, constructEquation } from './equationConstructors.js';

// ─── DFS solver + cache ───────────────────────────────────────────────────────
import { findEquationsFromTiles, _dfsLookupOrRun, getDfsCacheStats } from './dfsSolver.js';

// ─── Board builder ────────────────────────────────────────────────────────────
import { buildBoard, optimizeBoardLayout, RACK_SIZE } from './boardBuilder.js';

// ─── Tile mutation + quick checks ─────────────────────────────────────────────
import { mutateTileCountsSmart, quickChecks } from './equationMutator.js';

// ─── Config validation + feasibility ─────────────────────────────────────────
import {
  EQ_MAX_LOCAL,
  resolveEqualCount,
  validateConfig,
  validateDetailedConstraints,
  isConfigFeasible,
  explainConstraintFailure,
  sanitizeConfigForFallback,
} from './configValidator.js';

// =================================================================
// SECTION 1 — CONSTANTS & RE-EXPORTS
// =================================================================

export const GENERATOR_VERSION = 'v6.2';

// Re-export from helpers for backward compatibility with components & tests
export { OPS_ALL, OPS_SET, WILDS_SET, LIGHT_DIGS, HEAVY_LIST, HEAVY_SET };
export const WILD_TILES = WILDS_SET; // alias used by UI components

// Re-export POOL_DEF and DESCRIPTION_BOARD
export { POOL_DEF };
export { DESCRIPTION_BOARD } from './boardConstants.js';

// ── Tile point values (A-Math standard) ──────────────────────────────────────
export const TILE_POINTS = {
  '0':1, '1':1, '2':1, '3':1, '4':2, '5':2, '6':2, '7':2, '8':2, '9':2,
  '10':3,'11':4,'12':3,'13':6,'14':4,'15':4,'16':4,'17':6,'18':4,'19':7,'20':5,
  '+':2, '-':2, '×':2, '÷':2, '+/-':1, '×/÷':1, '=':1, '?':0,
};

// =================================================================
// SECTION 2 — TILE ASSIGNMENT
// =================================================================

export function applyTileAssignmentToPlacement(solutionTiles, placement, tileAssignmentSpec) {
  if (!tileAssignmentSpec || Object.keys(tileAssignmentSpec).length === 0) return placement;

  const catOf = (tile) => HEAVY_SET.has(tile) ? '__heavy__' : tile;

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
    const lockedVal = safeInt(spec.locked);
    const onRackVal = safeInt(spec.onRack);

    if (lockedVal != null && onRackVal != null) {
      lockedN = Math.min(lockedVal, total);
    } else if (lockedVal != null) {
      lockedN = Math.min(lockedVal, total);
    } else if (onRackVal != null) {
      lockedN = Math.max(0, total - Math.min(onRackVal, total));
    }

    if (lockedN !== null) {
      indices.slice(0, lockedN).forEach(i => { slotProbs[i] = 2; });
      indices.slice(lockedN).forEach(i => { slotProbs[i] = 0; });
    }
  }

  return { ...placement, slotProbs };
}

// =================================================================
// SECTION 3 — RESOLVED TILES (wild-card resolution for display)
// =================================================================

function computeResolvedTiles(solutionTiles, equation) {
  const resolved = [...solutionTiles];
  let ci = 0;

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
        const two = equation.slice(ci, ci + 2);
        if (HEAVY_SET.has(two)) { resolved[i] = two; ci += 2; }
        else { resolved[i] = ch; ci++; }
      }
    } else if (HEAVY_SET.has(src)) {
      resolved[i] = equation.slice(ci, ci + 2); ci += 2;
    } else {
      resolved[i] = equation[ci]; ci++;
    }
  }
  return resolved;
}

// =================================================================
// SECTION 4 — EQUATION-FIRST BUILDER
// =================================================================

// v6.2: Pre-filters N_ops to structurally feasible values before random
// selection — eliminates wasted retries on impossible operator counts.
function equationFirstBuilder(totalTile, cfg, eqCount, poolDef = POOL_DEF) {
  const opRange = toRange(cfg.operatorCount);
  const rawLo = opRange ? opRange[0] : (eqCount >= 3 ? 0 : 1);
  const rawHi = opRange ? opRange[1] : (eqCount >= 3 ? 2 : 3);

  const feasibleOps = [];
  for (let n = rawLo; n <= rawHi; n++) {
    const nb = totalTile - eqCount - n;
    const ns = n + eqCount + 1;
    if (nb >= ns && nb <= 3 * ns) feasibleOps.push(n);
  }
  if (feasibleOps.length === 0) return null;

  const N_ops = feasibleOps[0 | (Math.random() * feasibleOps.length)];

  const numBudget = totalTile - eqCount - N_ops;
  const numSlots  = N_ops + eqCount + 1;
  if (numBudget < numSlots || numBudget > 3 * numSlots) return null;

  const slack = numBudget - numSlots;
  const MAX_BUILDER_TRIES = eqCount >= 3
    ? (slack <= 1 ? 30 : 50)
    : (slack <= 1 ? 16 : slack === 2 ? 28 : 48);

  for (let attempt = 0; attempt < MAX_BUILDER_TRIES; attempt++) {
    const eq = constructEquationV6(N_ops, eqCount, totalTile, cfg.operatorSpec ?? null, poolDef);
    if (!eq) continue;

    let tileCounts;
    try {
      tileCounts = equationToTileCounts(eq, { preferHeavy: true });
    } catch {
      continue;
    }

    if (sumCounts(tileCounts) !== totalTile) continue;
    if (!withinPoolLimits(tileCounts, poolDef)) continue;

    const mutated = mutateTileCountsSmart(tileCounts, cfg, eqCount, poolDef);
    if (!mutated) continue;

    if (!quickChecks(mutated, cfg, eqCount)) continue;

    const mutAnalysis = analyzeCounts(mutated);
    if (mutAnalysis.wilds > 0) {
      const found = _dfsLookupOrRun(mutated, eqCount);
      if (!found.length) {
        if (!quickChecks(tileCounts, cfg, eqCount)) continue;
        const wRange = toRange(cfg.wildcardCount);
        const bRange = toRange(cfg.blankCount);
        if ((wRange && wRange[0] > 0) || (bRange && bRange[0] > 0)) continue;
        return { tileCounts, seedEquation: eq };
      }
    }

    return { tileCounts: mutated, seedEquation: eq };
  }

  return null;
}

const hybridTileBuilder = equationFirstBuilder;

// ── Operator diversity helpers ────────────────────────────────────────────────
// Used inside the main retry loop to vary operator combinations each attempt.

const _rndAdd = () => (Math.random() < 0.5 ? '+' : '-');
const _rndMul = () => (Math.random() < 0.6 ? '×' : '÷'); // slightly favour × over ÷

function _buildOpSpec(ops) {
  const spec = { '+': [0,0], '-': [0,0], '×': [0,0], '÷': [0,0], '+/-': [0,0], '×/÷': [0,0] };
  for (const op of ops) spec[op] = [spec[op][0] + 1, spec[op][1] + 1];
  return spec;
}

// =================================================================
// SECTION 5 — BOARD RESULT ASSEMBLER
// =================================================================

function _buildBoardResult(mode, chosen, tileCounts, seedEquation, cfg, totalTile, eqCount) {
  const difficulty = scoreEquationDifficulty(chosen.eq);

  if (mode === 'plain') {
    const solutionTiles = chosen.tiles;
    const boardSlots = solutionTiles.map(() => ({
      tile: null, isLocked: false, resolvedValue: null, slotType: 'px1',
    }));
    return {
      mode: 'plain',
      boardSlots,
      rackTiles: shuffle([...solutionTiles]),
      solutionTiles,
      equation: chosen.eq,
      totalTile,
      eqCount,
      difficulty,
      generatorVersion: GENERATOR_VERSION,
      tileCounts,
    };
  }

  if (mode === 'cross') {
    const solutionTiles = chosen.tiles;
    const lockCount = Math.max(0, totalTile - RACK_SIZE);
    const resolvedTiles = computeResolvedTiles(solutionTiles, chosen.eq);
    const noBonus = cfg.noBonus === true;
    let placement, lockPositions;
    let tries = 0;
    do {
      placement = selectRealisticPlacement(totalTile);
      const adj = applyTileAssignmentToPlacement(solutionTiles, placement, cfg.tileAssignmentSpec);
      lockPositions = selectLockPositions(totalTile, lockCount, adj);
      tries++;
    } while (!passesRealismFilter(placement) && tries < 10);
    const { cells } = placement;
    const lockSet = new Set(lockPositions);
    const board = Array.from({ length: 15 }, () => Array(15).fill(null));
    cells.forEach((cell, i) => { board[cell.r][cell.c] = solutionTiles[i]; });
    return {
      mode: 'cross',
      noBonus,
      board,
      boardSlots: solutionTiles.map((tile, i) => ({
        tile: lockSet.has(i) ? tile : null,
        isLocked: lockSet.has(i),
        resolvedValue: lockSet.has(i) && WILDS_SET.has(tile) ? resolvedTiles[i] : null,
        slotType: noBonus ? 'px1' : cells[i].type,
      })),
      placementRow: placement.rowIdx,
      placementCol: placement.colStart,
      placementDir: placement.dir,
      rackTiles: shuffle(solutionTiles.filter((_, i) => !lockSet.has(i))),
      solutionTiles,
      equation: chosen.eq,
      totalTile,
      eqCount,
      difficulty,
      generatorVersion: GENERATOR_VERSION,
      tileCounts,
    };
  }

  // expand mode
  const board = buildBoard(chosen.eq, chosen.tiles, cfg, { mode, totalTile, eqCount });
  if (!board) return null;
  return { ...board, eqCount, difficulty, generatorVersion: GENERATOR_VERSION, seedEquation, tileCounts };
}

// =================================================================
// SECTION 6 — DETERMINISTIC GUARANTEE LAYER
// =================================================================

function forceGuaranteedPuzzle(cfg) {
  const { mode, totalTile } = cfg;
  const poolDef = cfg.poolDef ?? POOL_DEF;
  const eqRange = toRange(cfg.equalCount);
  const targetEqCount = eqRange ? clamp(eqRange[0], 1, EQ_MAX_LOCAL) : 1;

  const templates = {
    '1_9':  { eq: '6-1-1-1=3',           tiles: ['6','-','1','-','1','-','1','=','3'],                                         eqCount: 1 },
    '1_10': { eq: '9+9+1+2=21',           tiles: ['9','+','9','+','1','+','2','=','2','1'],                                     eqCount: 1 },
    '1_11': { eq: '9-1-1-1-1=5',          tiles: ['9','-','1','-','1','-','1','-','1','=','5'],                                 eqCount: 1 },
    '2_9':  { eq: '3+4=7=7',              tiles: ['3','+','4','=','7','=','7'],                                                 eqCount: 2 },
    '2_10': { eq: '2+3=5=5',              tiles: ['2','+','3','=','5','=','5'],                                                 eqCount: 2 },
    '2_11': { eq: '1+2+3=6=6',            tiles: ['1','+','2','+','3','=','6','=','6'],                                         eqCount: 2 },
    '2_12': { eq: '3+4+5=12=12',          tiles: ['3','+','4','+','5','=','12','=','1','2'],                                    eqCount: 2 },
    '2_13': { eq: '1+2+3+4=10=10',        tiles: ['1','+','2','+','3','+','4','=','10','=','1','0'],                            eqCount: 2 },
    '3_8':  { eq: '2=2=2=2',              tiles: ['2','=','2','=','2','=','2'],                                                 eqCount: 3 },
    '3_9':  { eq: '1+2=3=3=3',            tiles: ['1','+','2','=','3','=','3','=','3'],                                         eqCount: 3 },
    '3_10': { eq: '5=5=5=5',              tiles: ['5','=','5','=','5','=','5'],                                                 eqCount: 3 },
    '3_11': { eq: '1+4=5=5=5',            tiles: ['1','+','4','=','5','=','5','=','5'],                                         eqCount: 3 },
    '3_12': { eq: '2+5=7=7=7',            tiles: ['2','+','5','=','7','=','7','=','7'],                                         eqCount: 3 },
    '3_13': { eq: '1+2+3=6=6=6',          tiles: ['1','+','2','+','3','=','6','=','6','=','6'],                                 eqCount: 3 },
    '3_14': { eq: '3+4+2=9=9=9',          tiles: ['3','+','4','+','2','=','9','=','9','=','9'],                                 eqCount: 3 },
    '3_15': { eq: '1+2+3+4=10=10=10',     tiles: ['1','+','2','+','3','+','4','=','10','=','1','0','=','10'],                   eqCount: 3 },
  };

  const templateKey = `${targetEqCount}_${totalTile}`;
  const tmpl = templates[templateKey];
  if (tmpl && tmpl.tiles.length === totalTile) {
    const quickCounts = {};
    tmpl.tiles.forEach(t => { quickCounts[t] = (quickCounts[t] || 0) + 1; });
    if (withinPoolLimits(quickCounts, poolDef)) {
      const result = _buildBoardResult(mode, { eq: tmpl.eq, tiles: tmpl.tiles }, quickCounts, tmpl.eq, cfg, totalTile, tmpl.eqCount);
      if (result) return result;
    }
  }

  const safeCfg = {
    mode,
    totalTile,
    operatorCount: targetEqCount >= 3 ? [0, 2] : [1, 1],
    equalCount: [targetEqCount, targetEqCount],
    wildcardCount: 0,
    blankCount: 0,
    heavyCount: null,
    operatorSpec: null,
    tileAssignmentSpec: cfg.tileAssignmentSpec ?? null,
    poolDef,
  };

  for (let retry = 0; retry < 30; retry++) {
    const built = equationFirstBuilder(totalTile, safeCfg, targetEqCount, poolDef);
    if (!built) continue;
    const { tileCounts, seedEquation } = built;
    const srcTiles = equationToSourceTiles(seedEquation);
    if (!srcTiles || srcTiles.length !== totalTile) continue;
    if (!withinPoolLimits(tileCounts, poolDef)) continue;
    const result = _buildBoardResult(mode, { eq: seedEquation, tiles: srcTiles }, tileCounts, seedEquation, cfg, totalTile, targetEqCount);
    if (result) return result;
  }

  const broaderCfg = { ...safeCfg, operatorCount: [0, 3] };
  for (let retry = 0; retry < 60; retry++) {
    const built = equationFirstBuilder(totalTile, broaderCfg, targetEqCount, poolDef);
    if (!built) continue;
    const { tileCounts, seedEquation } = built;
    const srcTiles = equationToSourceTiles(seedEquation);
    if (!srcTiles || srcTiles.length !== totalTile) continue;
    if (!withinPoolLimits(tileCounts, poolDef)) continue;
    const result = _buildBoardResult(mode, { eq: seedEquation, tiles: srcTiles }, tileCounts, seedEquation, cfg, totalTile, targetEqCount);
    if (result) return result;
  }

  // ── Deterministic construction ──────────────────────────────────────
  let eq, tiles;

  if (targetEqCount === 3) {
    for (let v = 1; v <= 20; v++) {
      const vt = numTiles(v);
      const bareTotal = 3 * vt + 3;
      const exprBudget = totalTile - bareTotal;

      if (exprBudget === vt) {
        eq = `${v}=${v}=${v}=${v}`;
        tiles = [];
        const vStr = String(v);
        for (let p = 0; p < 4; p++) {
          if (vt === 1) tiles.push(vStr);
          else for (const ch of vStr) tiles.push(ch);
          if (p < 3) tiles.push('=');
        }
        if (tiles.length === totalTile) break;
      }

      if (exprBudget >= 3 && exprBudget <= 9) {
        const numCount = Math.ceil(exprBudget / 2);
        const opCount  = exprBudget - numCount;
        if (opCount < 1) continue;
        const lastNum = v - (numCount - 1);
        if (lastNum >= 1 && lastNum <= 9) {
          const nums = [...Array(numCount - 1).fill(1), lastNum];
          const lhsStr = nums.join('+');
          if (evalExpr(lhsStr) === v) {
            eq = `${lhsStr}=${v}=${v}=${v}`;
            tiles = [];
            for (let i = 0; i < nums.length; i++) {
              tiles.push(String(nums[i]));
              if (i < nums.length - 1) tiles.push('+');
            }
            tiles.push('=');
            const vStr = String(v);
            for (let p = 0; p < 3; p++) {
              if (vt === 1) tiles.push(vStr);
              else for (const ch of vStr) tiles.push(ch);
              if (p < 2) tiles.push('=');
            }
            if (tiles.length === totalTile) break;
            else { eq = null; tiles = null; }
          }
        }
      }
    }
  } else if (targetEqCount === 2) {
    for (let v = 1; v <= 9; v++) {
      const bareTiles = 2 + 2;
      const exprBudget = totalTile - bareTiles;
      if (exprBudget < 1) continue;
      const numCount = Math.ceil(exprBudget / 2);
      const opCount  = exprBudget - numCount;
      if (opCount < 0) continue;
      if (opCount === 0 && numCount === 1) {
        eq = `${v}=${v}=${v}`;
        tiles = [String(v), '=', String(v), '=', String(v)];
        if (tiles.length === totalTile) break;
      }
      const lastNum = v - (numCount - 1);
      if (lastNum >= 1 && lastNum <= 9 && opCount >= 1) {
        const nums = [...Array(numCount - 1).fill(1), lastNum];
        const lhsStr = nums.join('+');
        eq = `${lhsStr}=${v}=${v}`;
        tiles = [];
        for (let i = 0; i < nums.length; i++) {
          tiles.push(String(nums[i]));
          if (i < nums.length - 1) tiles.push('+');
        }
        tiles.push('=', String(v), '=', String(v));
        if (tiles.length === totalTile) break;
        else { eq = null; tiles = null; }
      }
    }
  }

  if (!eq || !tiles || tiles.length !== totalTile) {
    if ((totalTile - 1) % 2 === 0) {
      const N = (totalTile - 1) / 2;
      if (N >= 2 && N <= 9) {
        tiles = [];
        for (let i = 0; i < N; i++) {
          tiles.push('1');
          if (i < N - 1) tiles.push('+');
        }
        tiles.push('=');
        tiles.push(String(N));
        eq = tiles.join('');
      }
    }
  }

  if (!eq || !tiles || tiles.length !== totalTile) {
    if ((totalTile - 2) % 2 === 0) {
      const N = (totalTile - 2) / 2;
      if (N >= 1) {
        const target = 21;
        const fixed  = N - 1;
        const last   = target - fixed;
        if (last >= 1 && last <= 9) {
          const nums = [...Array(fixed).fill(1), last];
          const lhs  = nums.join('+');
          eq = `${lhs}=${target}`;
          tiles = [];
          for (let i = 0; i < N; i++) {
            tiles.push(String(nums[i]));
            if (i < N - 1) tiles.push('+');
          }
          tiles.push('=', '2', '1');
        }
      }
    }
  }

  // Absolute last resort
  if (!eq || !tiles || tiles.length !== totalTile) {
    const baseTiles = ['1', '+', '2', '=', '3'];
    tiles = [...baseTiles];
    eq = '1+2=3';
    while (tiles.length < totalTile - 1) tiles.splice(tiles.indexOf('='), 0, '+', '1');
    while (tiles.length > totalTile) {
      const eqIdx = tiles.lastIndexOf('=');
      if (eqIdx > 2) tiles.splice(eqIdx - 2, 2);
      else { tiles = tiles.slice(0, totalTile); break; }
    }
    eq = tiles.join('').replace(/([+\-×÷=])/g, '$1');
    const eqIdx = tiles.lastIndexOf('=');
    if (eqIdx > 0) {
      const lhsTiles = tiles.slice(0, eqIdx);
      const lhsStr   = lhsTiles.join('');
      const lhsVal   = evalExpr(lhsStr);
      if (lhsVal !== null && lhsVal >= 0 && lhsVal <= 9) {
        tiles = [...lhsTiles, '=', String(lhsVal)];
        eq = lhsStr + '=' + lhsVal;
      }
    }
    while (tiles.length < totalTile) tiles.push('1');
    tiles = tiles.slice(0, totalTile);
  }

  const tileCounts = {};
  tiles.forEach(t => { tileCounts[t] = (tileCounts[t] || 0) + 1; });

  if (!withinPoolLimits(tileCounts, poolDef)) {
    for (let retry = 0; retry < 60; retry++) {
      const built = equationFirstBuilder(totalTile, broaderCfg, targetEqCount, poolDef);
      if (!built) continue;
      const { tileCounts: tc2, seedEquation: eq2 } = built;
      const srcTiles = equationToSourceTiles(eq2);
      if (!srcTiles || srcTiles.length !== totalTile) continue;
      if (!withinPoolLimits(tc2, poolDef)) continue;
      const result = _buildBoardResult(mode, { eq: eq2, tiles: srcTiles }, tc2, eq2, cfg, totalTile, targetEqCount);
      if (result) return result;
    }
    throw new Error('Unable to generate puzzle within configured poolDef constraints.');
  }

  const difficulty    = scoreEquationDifficulty(eq);
  const finalEqCount  = (eq.match(/=/g) || []).length;

  if (mode === 'plain') {
    return {
      mode: 'plain',
      boardSlots: tiles.map(() => ({ tile: null, isLocked: false, resolvedValue: null, slotType: 'px1' })),
      rackTiles: shuffle([...tiles]),
      solutionTiles: tiles,
      equation: eq,
      totalTile,
      eqCount: finalEqCount,
      difficulty,
      generatorVersion: GENERATOR_VERSION,
      tileCounts,
    };
  }

  if (mode === 'cross') {
    const lockCount = Math.max(0, totalTile - RACK_SIZE);
    const noBonus   = cfg.noBonus === true;
    let placement, lockPositions;
    let tries = 0;
    do {
      placement    = selectRealisticPlacement(totalTile);
      lockPositions = selectLockPositions(totalTile, lockCount, placement);
      tries++;
    } while (!passesRealismFilter(placement) && tries < 10);
    const { cells } = placement;
    const lockSet   = new Set(lockPositions);
    const board     = Array.from({ length: 15 }, () => Array(15).fill(null));
    cells.forEach((cell, i) => { if (i < tiles.length) board[cell.r][cell.c] = tiles[i]; });
    return {
      mode: 'cross',
      noBonus,
      board,
      boardSlots: tiles.map((tile, i) => ({
        tile: lockSet.has(i) ? tile : null,
        isLocked: lockSet.has(i),
        resolvedValue: null,
        slotType: noBonus ? 'px1' : (cells[i]?.type ?? 'px1'),
      })),
      placementRow: placement.rowIdx,
      placementCol: placement.colStart,
      placementDir: placement.dir,
      rackTiles: shuffle(tiles.filter((_, i) => !lockSet.has(i))),
      solutionTiles: tiles,
      equation: eq,
      totalTile,
      eqCount: finalEqCount,
      difficulty,
      generatorVersion: GENERATOR_VERSION,
      tileCounts,
    };
  }

  // expand mode
  const board = buildBoard(eq, tiles, cfg, { mode, totalTile, eqCount: finalEqCount });
  if (board) return { ...board, difficulty, generatorVersion: GENERATOR_VERSION, seedEquation: eq, tileCounts };

  return {
    mode,
    boardSlots: tiles.map(() => ({ tile: null, isLocked: false, resolvedValue: null, slotType: 'px1' })),
    rackTiles: shuffle([...tiles]),
    solutionTiles: tiles,
    equation: eq,
    totalTile,
    eqCount: finalEqCount,
    difficulty,
    generatorVersion: GENERATOR_VERSION,
    tileCounts,
  };
}

// =================================================================
// SECTION 7 — PUBLIC API
// =================================================================

export function generateBingo(cfg) {
  validateConfig(cfg);
  validateDetailedConstraints(cfg);
  const { mode, totalTile } = cfg;
  const hasCustomConstraints = Boolean(
    cfg.operatorCount ||
    cfg.heavyCount ||
    cfg.wildcardCount ||
    cfg.blankCount ||
    cfg.equalCount ||
    cfg.operatorSpec ||
    cfg.tileAssignmentSpec ||
    cfg.poolDef
  );
  const startMs     = Date.now();
  const wallBudgetMs = hasCustomConstraints ? Number.POSITIVE_INFINITY : (totalTile <= 11 ? 35 : 55);
  const timedOut    = () => (Date.now() - startMs) > wallBudgetMs;
  const poolDefResolved = cfg.poolDef ?? POOL_DEF;

  const tryBuildResultFromBuilt = (built, eqCount, boardCfg = cfg) => {
    if (!built) return null;
    const { tileCounts, seedEquation } = built;
    const analysis = analyzeCounts(tileCounts);
    let chosen;
    if (analysis.wilds === 0) {
      const srcTiles = equationToSourceTiles(seedEquation);
      if (!srcTiles || srcTiles.length !== totalTile) return null;
      chosen = { eq: seedEquation, tiles: srcTiles };
    } else {
      const found = _dfsLookupOrRun(tileCounts, eqCount);
      if (!found.length) return null;
      chosen = found.reduce((best, c) => {
        const flex     = c.tiles.filter(t => t === '?' || t === '+/-' || t === '×/÷').length;
        const bestFlex = best.tiles.filter(t => t === '?' || t === '+/-' || t === '×/÷').length;
        return flex < bestFlex ? c : best;
      });
    }
    return _buildBoardResult(mode, chosen, tileCounts, seedEquation, boardCfg, totalTile, eqCount);
  };

  if (!isConfigFeasible(cfg)) {
    if (hasCustomConstraints) {
      throw new Error(`Selected advanced constraints are structurally infeasible for this tile count. Reason: ${explainConstraintFailure(cfg)}`);
    }
    const fallbackCfg = sanitizeConfigForFallback(cfg);
    if (!isConfigFeasible(fallbackCfg)) return forceGuaranteedPuzzle(fallbackCfg);
    return generateBingo(fallbackCfg);
  }

  const eqRange          = toRange(cfg.equalCount);
  const eqCountForClamp  = eqRange ? Math.min(eqRange[1], EQ_MAX_LOCAL) : 1;

  const opHiClamp = Math.min(6, Math.floor((totalTile - 2 * eqCountForClamp - 1) / 2));
  const opRange   = toRange(cfg.operatorCount);
  const rawOpLo   = opRange ? opRange[0] : (eqCountForClamp >= 3 ? 0 : 1);
  const rawOpHi   = opRange ? opRange[1] : 3;
  const opLo      = Math.max(0, Math.min(rawOpLo, opHiClamp));
  const opHi      = Math.min(opHiClamp, Math.max(rawOpHi, opLo));
  let committedOpCount = opLo <= opHi ? randInt(opLo, opHi) : opLo;

  // Small board bias for fewer operators
  if (!cfg.operatorCount && totalTile <= 11 && opHi > opLo) {
    const opCandidates = [];
    const opWeights    = [];
    for (let n = opLo; n <= opHi; n++) {
      const numBudget = totalTile - eqCountForClamp - n;
      const numSlots  = n + eqCountForClamp + 1;
      const slack     = Math.max(0, numBudget - numSlots);
      const base      = Math.max(1, 4 - (n - opLo));
      opCandidates.push(n);
      opWeights.push(base + slack);
    }
    if (opCandidates.length > 0) committedOpCount = weightedSample(opCandidates, opWeights);
  }

  let cfgCommitted = { ...cfg, operatorCount: [committedOpCount, committedOpCount] };

  // BUGFIX: Pre-commit operator weights — balanced for all 4 operators.
  // All operators have similar success rates now that backward-solve works.
  if (committedOpCount === 1 && !cfg.operatorSpec) {
    const picked = weightedSample(['+', '-', '×', '÷'], [4, 4, 4, 4]);
    cfgCommitted = {
      ...cfgCommitted,
      operatorSpec: {
        '+': [0,0], '-': [0,0], '×': [0,0], '÷': [0,0],
        '+/-': [0,0], '×/÷': [0,0],
        [picked]: [1,1],
      },
    };
  }

  const committedOp1 = cfgCommitted.operatorSpec
    ? Object.keys(cfgCommitted.operatorSpec).find(k => {
        const r = toRange(cfgCommitted.operatorSpec[k]);
        return r && r[0] >= 1;
      })
    : null;

  const MAX_RETRIES = eqCountForClamp >= 3 ? 30
    : (committedOp1 === '÷' || committedOp1 === '×') ? 22
    : 14;

  const eqRangeCommitted = toRange(cfgCommitted.equalCount);
  const eqLoCommitted    = eqRangeCommitted ? clamp(eqRangeCommitted[0], 1, EQ_MAX_LOCAL) : 1;
  const eqHiCommitted    = eqRangeCommitted ? clamp(eqRangeCommitted[1], 1, EQ_MAX_LOCAL) : 1;
  const _eqCandidatesLen = eqHiCommitted - eqLoCommitted + 1;
  const eqCandidatesMain = (Number.isFinite(_eqCandidatesLen) && _eqCandidatesLen > 0)
    ? Array.from({ length: _eqCandidatesLen }, (_, i) => eqLoCommitted + i)
    : [1];

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    if (timedOut()) break;
    const eqCount = eqCandidatesMain.length === 1
      ? eqCandidatesMain[0]
      : eqCandidatesMain[0 | (Math.random() * eqCandidatesMain.length)];

    // Per-retry operator diversification when user didn't pin operatorSpec.
    // Without this, +/- combinations dominate because constructEquationV6
    // picks additive operators far more often than ×/÷.
    let tryCfg = cfgCommitted;
    if (!cfg.operatorSpec) {
      if (committedOpCount === 2) {
        const r = Math.random();
        const ops = r < 0.30
          ? [_rndAdd(), _rndAdd()]                                                          // 30% both +/-
          : r < 0.70
          ? (Math.random() < 0.5 ? [_rndAdd(), _rndMul()] : [_rndMul(), _rndAdd()])       // 40% mixed
          : [_rndMul(), _rndMul()];                                                         // 30% both ×/÷
        tryCfg = { ...cfgCommitted, operatorSpec: _buildOpSpec(ops) };
      } else if (committedOpCount === 3) {
        const r = Math.random();
        const ops = r < 0.20
          ? [_rndAdd(), _rndAdd(), _rndAdd()]                                               // 20% all +/-
          : r < 0.65
          ? shuffle([_rndAdd(), _rndAdd(), _rndMul()])                                      // 45% two +/- one ×/÷
          : shuffle([_rndAdd(), _rndMul(), _rndMul()]);                                     // 35% one +/- two ×/÷
        tryCfg = { ...cfgCommitted, operatorSpec: _buildOpSpec(ops) };
      }
    }

    const built = equationFirstBuilder(totalTile, tryCfg, eqCount, tryCfg.poolDef ?? POOL_DEF);
    if (!built) continue;

    const result = tryBuildResultFromBuilt(built, eqCount, cfg);
    if (result) return result;
  }

  // Custom constraints: deep strict pass
  if (hasCustomConstraints) {
    const eqRangeStrict = toRange(cfg.equalCount);
    const eqCandidates  = eqRangeStrict
      ? Array.from({ length: eqRangeStrict[1] - eqRangeStrict[0] + 1 }, (_, i) => eqRangeStrict[0] + i)
      : [1];

    const opRangeStrict  = toRange(cfg.operatorCount);
    const strictOpLoRaw  = opRangeStrict ? opRangeStrict[0] : 0;
    const strictOpHiRaw  = opRangeStrict ? opRangeStrict[1] : 3;

    for (const eqCount of eqCandidates) {
      const strictOpHiClamp = Math.min(6, Math.floor((totalTile - 2 * eqCount - 1) / 2));
      const strictOpLo      = Math.max(0, Math.min(strictOpLoRaw, strictOpHiClamp));
      const strictOpHi      = Math.min(strictOpHiClamp, Math.max(strictOpHiRaw, strictOpLo));
      for (let nOps = strictOpLo; nOps <= strictOpHi; nOps++) {
        const strictCfg  = { ...cfg, operatorCount: [nOps, nOps] };
        const deepTries  = eqCount >= 3 ? 200 : 120;
        for (let deepTry = 0; deepTry < deepTries; deepTry++) {
          const built  = equationFirstBuilder(totalTile, strictCfg, eqCount, poolDefResolved);
          const result = tryBuildResultFromBuilt(built, eqCount, cfg);
          if (result) return result;
        }
      }
    }
    throw new Error(`Unable to generate puzzle that satisfies the selected advanced constraints. Reason: ${explainConstraintFailure(cfg)}`);
  }

  // Constraint-relaxation fallback tiers
  const relaxedCfgs = [
    { ...cfgCommitted, wildcardCount: 0, blankCount: 0 },
    { ...cfgCommitted, wildcardCount: 0, blankCount: 0, heavyCount: null },
    { ...cfgCommitted, wildcardCount: 0, blankCount: 0, heavyCount: null, operatorSpec: null },
    { mode, totalTile, operatorCount: [1, 1], wildcardCount: 0, blankCount: 0, poolDef: cfgCommitted.poolDef ?? POOL_DEF },
    ...(eqCountForClamp >= 3 ? [
      { mode, totalTile, operatorCount: [0, 1], equalCount: [eqCountForClamp, eqCountForClamp], wildcardCount: 0, blankCount: 0, poolDef: cfgCommitted.poolDef ?? POOL_DEF },
    ] : []),
  ];

  for (const relaxed of relaxedCfgs) {
    if (timedOut()) break;
    const eqCount = resolveEqualCount(mode, relaxed);
    for (let retry = 0; retry < 12; retry++) {
      if (timedOut()) break;
      const built = equationFirstBuilder(totalTile, relaxed, eqCount, relaxed.poolDef ?? POOL_DEF);
      if (!built) continue;
      const result = tryBuildResultFromBuilt(built, eqCount, cfg);
      if (result) return result;
    }
  }

  return forceGuaranteedPuzzle(sanitizeConfigForFallback(cfg));
}

export function generateBingoBatch(cfg, count = 10) {
  return Array.from({ length: count }, () => generateBingo(cfg));
}

export { getDfsCacheStats };

// Named exports for backward compatibility
export {
  findEquationsFromTiles,
  makeCounts,
  isValidEquation,
  constructEquation,
  equationToTileCounts,
  equationToSourceTiles,
  hybridTileBuilder,
  scoreEquationDifficulty,
  optimizeBoardLayout,
  buildBoard,
  mutateTileCountsSmart,
  quickChecks,
  constructEquationV6,
};
