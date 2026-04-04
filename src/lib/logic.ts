// ================================================================
// bingoLogic.ts  –  A-Math Bingo Generator  (Cross & Expand)
// ================================================================

import { CHOICE_SET, HEAVY_ARR, HEAVY_SET, LIGHT_ARR, OPS_ARR, OPS_SET, POOL_DEF } from './amathTokens';

export type BingoMode = 'cross' | 'expand';

export interface BingoOptions {
  mode: BingoMode;
  /**
   * Total tiles in the equation (rack = always 8 tiles, fixed = totalTile - 8).
   * Valid range: 9-15 for cross, 11-15 for expand.
   */
  totalTile: number;
}

export interface BingoResult {
  mode: BingoMode;
  /** 15-slot linear space. null = empty, string = fixed tile token. */
  space: (string | null)[];
  /** 0-based start index of the equation in the 15-slot space. */
  equationStart: number;
  /** Full equation string e.g. "3+2=5=8-3". */
  equation: string;
  /** Token array (composite numbers as single token e.g. "12"). */
  equationTokens: string[];
  /**
   * Token indices that are fixed on the board.
   * Sum of tileCount(equationTokens[i] for i in fixedIndices) = totalTile - 8.
   */
  fixedIndices: number[];
  /** Tokens for the player's rack (exactly 8 tiles worth). */
  rack: string[];
  /** Expand only: contiguous token indices forming the block sub-equation. */
  blockIndices?: number[];
}

// ─────────────────────────────────────────────
// Pool & Constants
// ─────────────────────────────────────────────
function makeCounts(): Record<string, number> {
  return Object.fromEntries(Object.entries(POOL_DEF).map(([k, v]) => [k, v]));
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function isNum(t: string)   { return /^\d+$/.test(t); }
function isHeavy(t: string) { return HEAVY_SET.has(t); }

/**
 * Number of physical tiles a token occupies:
 *   heavy number (10-20) -> 1 tile
 *   light digit string   -> digit count  ("1"->1, "23"->2, "123"->3)
 *   operator / = / ?     -> 1 tile
 */
export function tileCount(tok: string): number {
  if (isHeavy(tok)) return 1;
  if (isNum(tok))   return tok.length;
  return 1;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function evalExpr(tokens: string[]): number | null {
  const s = tokens.map(t => t === '×' ? '*' : t === '÷' ? '/' : t).join('');
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict"; return (' + s + ')')() as unknown;
    if (typeof v !== 'number' || !isFinite(v as number)) return null;
    return v as number;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// A-Math Rule Validator
// ─────────────────────────────────────────────
export function isValidEquation(tokens: string[]): boolean {
  if (tokens.length < 3) return false;

  const eqPos = tokens.reduce<number[]>((a, t, i) => {
    if (t === '=') a.push(i); return a;
  }, []);
  if (eqPos.length === 0) return false;

  const first = tokens[0], last = tokens[tokens.length - 1];
  if (first === '=' || (OPS_SET.has(first) && first !== '-')) return false;
  if (last  === '=' || OPS_SET.has(last))  return false;

  for (let i = 0; i < tokens.length; i++) {
    const c = tokens[i], p = tokens[i - 1], n = tokens[i + 1];
    if (CHOICE_SET.has(c)) return false;
    if (isHeavy(c)) {
      if (p && isNum(p)) return false;
      if (n && isNum(n)) return false;
    }
    if (OPS_SET.has(c) || c === '=') {
      if (n && (OPS_SET.has(n) || n === '=')) {
        if (!(c === '=' && n === '-')) return false;
      }
    }
    if (c === '÷' && n === '0') return false;
    // -0 forbidden when '-' is binary (has number/= before it)
    if (c === '-' && n === '0' && p && (isNum(p) || p === '=')) return false;
  }

  // Leading-zero check across digit-string composites
  let nb = '';
  for (const t of tokens) {
    if (isNum(t)) nb += t;
    else { if (nb.length >= 2 && nb[0] === '0') return false; nb = ''; }
  }
  if (nb.length >= 2 && nb[0] === '0') return false;

  // All segments separated by '=' must evaluate to the same value
  const segs: string[][] = [];
  let seg: string[] = [];
  for (const t of tokens) {
    if (t === '=') { segs.push(seg); seg = []; } else seg.push(t);
  }
  segs.push(seg);
  if (segs.some(s => s.length === 0)) return false;
  const vals = segs.map(s => evalExpr(s));
  if (vals.some(v => v === null)) return false;
  return vals.every(v => Math.abs(v! - vals[0]!) < 1e-9);
}

function isValidSubEq(tokens: string[]): boolean {
  return tokens.filter(t => t === '=').length === 1 && isValidEquation(tokens);
}

// ─────────────────────────────────────────────
// Core backtracking equation builder
// Produces a token array whose total tileCount == targetTiles
// allowUnary: permit unary '-' at start and after '='
// ─────────────────────────────────────────────
function buildEquation(
  targetTiles: number,
  allowUnary: boolean,
  maxAttempts = 10000
): string[] | null {
  for (let run = 0; run < 60; run++) {
    const counts = makeCounts();
    const tokens: string[] = [];
    let usedTiles = 0;
    let attempts  = 0;

    const consume   = (t: string, ti: number) => { counts[t]--; usedTiles += ti; };
    const unconsume = (t: string, ti: number) => { counts[t]++; usedTiles -= ti; };
    const avail     = (t: string) => (counts[t] || 0) > 0;
    const rem       = () => targetTiles - usedTiles;

    type Ph = 'start' | 'afterNum' | 'afterOp' | 'afterEq';

    function dfs(phase: Ph, eqUsed: number): boolean {
      if (attempts++ > maxAttempts) return false;
      const r = rem();
      if (r < 0) return false;
      if (r === 0) return phase === 'afterNum' && eqUsed >= 1 && isValidEquation(tokens);
      if (eqUsed === 0 && r < 2) return false;

      switch (phase) {
        case 'start':
        case 'afterEq':
        case 'afterOp': {
          const canUnary = allowUnary && (phase === 'start' || phase === 'afterEq');
          if (canUnary && avail('-') && r >= 2) {
            consume('-', 1); tokens.push('-');
            if (dfs('afterOp', eqUsed)) return true;
            tokens.pop(); unconsume('-', 1);
            if (attempts > maxAttempts) return false;
          }
          return placeNum(eqUsed);
        }
        case 'afterNum': {
          if (eqUsed === 0 && r >= 2 && avail('=')) {
            consume('=', 1); tokens.push('=');
            if (dfs('afterEq', eqUsed + 1)) return true;
            tokens.pop(); unconsume('=', 1);
            if (attempts > maxAttempts) return false;
          }
          for (const op of shuffle(OPS_ARR)) {
            if (avail(op) && r >= 2) {
              consume(op, 1); tokens.push(op);
              if (dfs('afterOp', eqUsed)) return true;
              tokens.pop(); unconsume(op, 1);
              if (attempts > maxAttempts) return false;
            }
          }
          return false;
        }
      }
    }

    function placeNum(eqUsed: number): boolean {
      for (const h of shuffle(HEAVY_ARR)) {
        if (avail(h) && rem() >= 1) {
          consume(h, 1); tokens.push(h);
          if (dfs('afterNum', eqUsed)) return true;
          tokens.pop(); unconsume(h, 1);
          if (attempts > maxAttempts) return false;
        }
      }
      return buildDigit([], eqUsed);
    }

    function buildDigit(soFar: string[], eqUsed: number): boolean {
      if (attempts > maxAttempts || rem() < 1) return false;
      const pool = soFar.length === 0
        ? shuffle(['0', ...LIGHT_ARR])
        : shuffle(LIGHT_ARR);
      for (const d of pool) {
        if (!avail(d)) continue;
        const lz = soFar.length === 0 && d === '0';
        consume(d, 1);
        const nd = [...soFar, d];
        tokens.push(nd.join(''));
        if (dfs('afterNum', eqUsed)) return true;
        tokens.pop();
        if (!lz && nd.length < 3 && rem() >= 1) {
          if (buildDigit(nd, eqUsed)) { unconsume(d, 1); return true; }
        }
        unconsume(d, 1);
        if (attempts > maxAttempts) return false;
      }
      return false;
    }

    if (dfs('start', 0)) {
      const total = tokens.reduce((s, t) => s + tileCount(t), 0);
      if (total === targetTiles) return [...tokens];
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Build a pure expression (no '=') of tileTarget tiles
// that evaluates to targetVal
// ─────────────────────────────────────────────
function buildExpression(
  tileTarget: number,
  targetVal: number,
  maxAttempts = 3000
): string[] | null {
  if (tileTarget < 1) return null;

  for (let run = 0; run < 30; run++) {
    const counts = makeCounts();
    const tokens: string[] = [];
    let usedTiles = 0;
    let attempts  = 0;

    const consume   = (t: string, ti: number) => { counts[t]--; usedTiles += ti; };
    const unconsume = (t: string, ti: number) => { counts[t]++; usedTiles -= ti; };
    const avail     = (t: string) => (counts[t] || 0) > 0;
    const rem       = () => tileTarget - usedTiles;

    type Ph2 = 'start' | 'afterNum' | 'afterOp';

    function dfs(phase: Ph2): boolean {
      if (attempts++ > maxAttempts) return false;
      const r = rem();
      if (r < 0) return false;
      if (r === 0) {
        if (phase !== 'afterNum') return false;
        const v = evalExpr(tokens);
        return v !== null && Math.abs(v - targetVal) < 1e-9;
      }
      if (phase === 'afterNum') {
        for (const op of shuffle(OPS_ARR)) {
          if (avail(op) && r >= 2) {
            consume(op, 1); tokens.push(op);
            if (dfs('afterOp')) return true;
            tokens.pop(); unconsume(op, 1);
            if (attempts > maxAttempts) return false;
          }
        }
        return false;
      }
      return placeNum();
    }

    function placeNum(): boolean {
      for (const h of shuffle(HEAVY_ARR)) {
        if (avail(h) && rem() >= 1) {
          consume(h, 1); tokens.push(h);
          if (dfs('afterNum')) return true;
          tokens.pop(); unconsume(h, 1);
          if (attempts > maxAttempts) return false;
        }
      }
      return buildDigit([]);
    }

    function buildDigit(soFar: string[]): boolean {
      if (attempts > maxAttempts || rem() < 1) return false;
      const pool = soFar.length === 0
        ? shuffle(['0', ...LIGHT_ARR])
        : shuffle(LIGHT_ARR);
      for (const d of pool) {
        if (!avail(d)) continue;
        const lz = soFar.length === 0 && d === '0';
        consume(d, 1);
        const nd = [...soFar, d];
        tokens.push(nd.join(''));
        if (dfs('afterNum')) return true;
        tokens.pop();
        if (!lz && nd.length < 3 && rem() >= 1) {
          if (buildDigit(nd)) { unconsume(d, 1); return true; }
        }
        unconsume(d, 1);
        if (attempts > maxAttempts) return false;
      }
      return false;
    }

    if (dfs('start')) {
      const total = tokens.reduce((s, t) => s + tileCount(t), 0);
      if (total === tileTarget) return [...tokens];
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Fixed-tile selectors
// ─────────────────────────────────────────────

/**
 * Cross: pick token indices whose tileCount sum = fixedTileTarget
 * with no two chosen indices adjacent (|i-j| > 1).
 */
function pickFixedNonAdjacent(
  eq: string[],
  fixedTileTarget: number,
  maxTries = 400
): number[] | null {
  const n = eq.length;
  for (let t = 0; t < maxTries; t++) {
    const order = shuffle(Array.from({ length: n }, (_, i) => i));
    const chosen: number[] = [];
    let tilesChosen = 0;

    for (const idx of order) {
      if (tilesChosen >= fixedTileTarget) break;
      if (chosen.some(c => Math.abs(c - idx) === 1)) continue;
      const tc = tileCount(eq[idx]);
      if (tilesChosen + tc > fixedTileTarget) continue;
      chosen.push(idx);
      tilesChosen += tc;
    }
    if (tilesChosen === fixedTileTarget) return chosen.sort((a, b) => a - b);
  }
  return null;
}

/**
 * Expand: pick exactly one contiguous valid-sub-equation block
 * plus isolated (non-adjacent) tiles such that total fixed tile sum = fixedTileTarget.
 */
function pickFixedExpand(
  eq: string[],
  fixedTileTarget: number,
  maxTries = 400
): { fixedIndices: number[]; blockIndices: number[] } | null {
  // All valid contiguous blocks
  const validBlocks: Array<{ start: number; len: number; tiles: number }> = [];
  for (let bs = 0; bs < eq.length; bs++) {
    let bt = 0;
    for (let bl = 1; bl <= eq.length - bs; bl++) {
      bt += tileCount(eq[bs + bl - 1]);
      if (bt > fixedTileTarget) break;
      if (bl >= 3 && isValidSubEq(eq.slice(bs, bs + bl))) {
        validBlocks.push({ start: bs, len: bl, tiles: bt });
      }
    }
  }
  if (validBlocks.length === 0) return null;

  for (let t = 0; t < maxTries; t++) {
    const block = validBlocks[Math.floor(Math.random() * validBlocks.length)];
    const bSet  = new Set(Array.from({ length: block.len }, (_, i) => block.start + i));
    const isoTileCount = fixedTileTarget - block.tiles;
    const bf  = block.start;
    const bl2 = block.start + block.len - 1;

    // Candidates: not in block, not adjacent to block boundary
    const cands = eq.map((_, i) => i).filter(
      i => !bSet.has(i) && i !== bf - 1 && i !== bl2 + 1
    );

    let isoIndices: number[] = [];
    if (isoTileCount > 0) {
      const shuffled = shuffle([...cands]);
      let tilesSoFar = 0;
      for (const idx of shuffled) {
        if (tilesSoFar >= isoTileCount) break;
        if (isoIndices.some(c => Math.abs(c - idx) === 1)) continue;
        const tc = tileCount(eq[idx]);
        if (tilesSoFar + tc > isoTileCount) continue;
        isoIndices.push(idx);
        tilesSoFar += tc;
      }
      if (tilesSoFar !== isoTileCount) continue;
    }

    const fixedIndices = [...bSet, ...isoIndices].sort((a, b) => a - b);
    const blockIndices = Array.from({ length: block.len }, (_, i) => block.start + i);
    return { fixedIndices, blockIndices };
  }
  return null;
}

// ─────────────────────────────────────────────
// Cross Bingo
// ─────────────────────────────────────────────
function generateCross(options: BingoOptions, maxTries = 300): BingoResult | null {
  const { totalTile } = options;
  const fixedTiles = totalTile - 8;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const eq = buildEquation(totalTile, true);
    if (!eq) continue;

    const fixedIndices = pickFixedNonAdjacent(eq, fixedTiles);
    if (!fixedIndices) continue;

    // Verify rack tiles = 8
    const rackToks = eq.filter((_, i) => !fixedIndices.includes(i));
    if (rackToks.reduce((s, t) => s + tileCount(t), 0) !== 8) continue;

    const maxStart = 15 - totalTile;
    if (maxStart < 0) continue;
    const start = Math.floor(Math.random() * (maxStart + 1));

    const space: (string | null)[] = Array(15).fill(null);
    for (const fi of fixedIndices) space[start + fi] = eq[fi];

    return {
      mode: 'cross',
      space,
      equationStart: start,
      equation: eq.join(''),
      equationTokens: eq,
      fixedIndices,
      rack: rackToks,
    };
  }
  return null;
}

// ─────────────────────────────────────────────
// Expand Bingo
// Two-step: build block equation, then attach expression of same value
// ─────────────────────────────────────────────
function generateExpand(options: BingoOptions, maxTries = 300): BingoResult | null {
  const { totalTile } = options;
  const fixedTiles = totalTile - 8;
  if (fixedTiles < 3) return null;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    // Pick block tile size: 3 to min(fixedTiles, totalTile-4)
    const maxBT = Math.min(fixedTiles, totalTile - 4);
    if (maxBT < 3) continue;
    const blockTiles = 3 + Math.floor(Math.random() * (maxBT - 2));
    const extTiles   = totalTile - blockTiles;
    if (extTiles < 2) continue; // need '=' + at least 1 tile

    // Build block sub-equation (no unary for standalone validity)
    const blockEq = buildEquation(blockTiles, false);
    if (!blockEq || !isValidSubEq(blockEq)) continue;

    // Evaluate block value from first segment
    const firstSeg: string[] = [];
    for (const t of blockEq) { if (t === '=') break; firstSeg.push(t); }
    const blockVal = evalExpr(firstSeg);
    if (blockVal === null || !isFinite(blockVal)) continue;

    // Build right expression of (extTiles - 1) tiles equal to blockVal
    const rightTiles = extTiles - 1;
    if (rightTiles < 1) continue;
    const rightExpr = buildExpression(rightTiles, blockVal);
    if (!rightExpr) continue;

    // Assemble full equation
    const fullEq = [...blockEq, '=', ...rightExpr];
    if (!isValidEquation(fullEq)) continue;

    const totalCheck = fullEq.reduce((s, t) => s + tileCount(t), 0);
    if (totalCheck !== totalTile) continue;

    // Pick fixed indices with block constraint
    const picked = pickFixedExpand(fullEq, fixedTiles);
    if (!picked) continue;

    const { fixedIndices, blockIndices } = picked;

    // Verify rack tiles = 8
    const rackToks = fullEq.filter((_, i) => !fixedIndices.includes(i));
    if (rackToks.reduce((s, t) => s + tileCount(t), 0) !== 8) continue;

    const maxStart = 15 - totalTile;
    if (maxStart < 0) continue;
    const start = Math.floor(Math.random() * (maxStart + 1));

    const space: (string | null)[] = Array(15).fill(null);
    for (const fi of fixedIndices) space[start + fi] = fullEq[fi];

    return {
      mode: 'expand',
      space,
      equationStart: start,
      equation: fullEq.join(''),
      equationTokens: fullEq,
      fixedIndices,
      rack: rackToks,
      blockIndices,
    };
  }
  return null;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
export function generateBingo(options: BingoOptions): BingoResult {
  const { totalTile, mode } = options;
  if (totalTile < 9 || totalTile > 15)
    throw new Error('totalTile must be between 9 and 15.');
  if (mode === 'expand' && totalTile < 11)
    throw new Error('Expand mode requires totalTile >= 11.');

  for (let mega = 0; mega < 20; mega++) {
    const result = mode === 'cross'
      ? generateCross(options)
      : generateExpand(options);
    if (result) return result;
  }
  throw new Error(
    `Could not generate a valid ${mode} bingo puzzle. Try a different totalTile.`
  );
}