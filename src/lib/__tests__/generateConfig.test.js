/**
 * generateConfig.test.js
 *
 * End-to-end tests: generateBingo() with all BingoConfig / BingoAdvancedConfig options.
 *
 * Strategy: run SAMPLES puzzles per config and assert ALL of them satisfy the constraint.
 * Because constraints are deterministically enforced inside satisfiesConfigFromCounts(),
 * SAMPLES=5 is sufficient to catch any systematic violations.
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest';
import { generateBingo, OPS_SET, HEAVY_SET } from '@/lib/bingoGenerator.js';
import { buildGeneratorConfig, DEFAULT_ADV_CFG } from '@/components/bingo/BingoAdvancedConfig.jsx';

const SAMPLES = 5;

// ─── Analysis helpers ─────────────────────────────────────────────────────────

const countOps    = (tiles) => tiles.filter(t => OPS_SET.has(t)).length;
const countHeavy  = (tiles) => tiles.filter(t => HEAVY_SET.has(t)).length;
const countBlanks = (tiles) => tiles.filter(t => t === '?').length;
const countOp     = (tiles, op) => tiles.filter(t => t === op).length;

// ─── Config builder helpers ───────────────────────────────────────────────────

/**
 * Merge overrides into DEFAULT_ADV_CFG.
 * operatorSpec overrides are applied per-operator so unmentioned ops keep defaults.
 */
function buildAdv({ operatorSpec: opOverrides, ...rest } = {}) {
  return {
    ...DEFAULT_ADV_CFG,
    ...rest,
    operatorSpec: {
      ...DEFAULT_ADV_CFG.operatorSpec,
      ...(opOverrides ?? {}),
    },
  };
}

/** Build a single enabled operatorSpec entry */
function opEntry(min, max, { locked = 0, onRack = 0, placementEnabled = false } = {}) {
  return { enabled: true, min, max, placementEnabled, locked, onRack };
}

function gen(mode, tileCount, adv = DEFAULT_ADV_CFG) {
  return generateBingo(buildGeneratorConfig(mode, tileCount, adv));
}

function genN(mode, tileCount, adv = DEFAULT_ADV_CFG, n = SAMPLES) {
  return Array.from({ length: n }, () => gen(mode, tileCount, adv));
}

// =============================================================================
// 1. Basic output structure — all tile counts, both modes
// =============================================================================

describe('generateBingo — basic output structure', () => {
  const TILE_COUNTS = [8, 9, 10, 11, 12, 13, 14, 15];

  for (const tileCount of TILE_COUNTS) {
    it(`cross mode, ${tileCount} tiles`, () => {
      const lockCount = Math.max(0, tileCount - 8);
      for (let i = 0; i < 3; i++) {
        const p = gen('cross', tileCount);

        expect(p.mode).toBe('cross');
        expect(p.generatorVersion).toBe('v5');
        expect(p.totalTile).toBe(tileCount);
        expect(p.equation).toBeTypeOf('string');
        expect(p.equation.length).toBeGreaterThan(0);

        expect(p.solutionTiles).toHaveLength(tileCount);
        expect(p.boardSlots).toHaveLength(tileCount);
        expect(p.rackTiles).toHaveLength(8);

        // Locked count matches expected
        const locked = p.boardSlots.filter(s => s.isLocked);
        expect(locked).toHaveLength(lockCount);

        // Locked slots have tile value; unlocked have null
        locked.forEach(s => expect(s.tile).not.toBeNull());
        p.boardSlots.filter(s => !s.isLocked).forEach(s => expect(s.tile).toBeNull());
      }
    });
  }

  for (const tileCount of [8, 9, 10, 12, 15]) {
    it(`plain mode, ${tileCount} tiles`, () => {
      for (let i = 0; i < 3; i++) {
        const p = gen('plain', tileCount);

        expect(p.mode).toBe('plain');
        expect(p.totalTile).toBe(tileCount);
        expect(p.solutionTiles).toHaveLength(tileCount);
        // Plain mode: all tiles go to rack, none locked
        expect(p.rackTiles).toHaveLength(tileCount);
        expect(p.boardSlots.every(s => !s.isLocked)).toBe(true);
      }
    });
  }
});

// =============================================================================
// 2. operatorCount constraint
// =============================================================================

describe('generateBingo — operatorCount constraint', () => {
  it('exactly 1 operator [min=1, max=1] — 9 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 1, max: 1 } });
    for (const p of genN('cross', 9, adv)) {
      expect(countOps(p.solutionTiles)).toBe(1);
    }
  });

  it('exactly 2 operators [min=2, max=2] — 11 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 2, max: 2 } });
    for (const p of genN('cross', 11, adv)) {
      expect(countOps(p.solutionTiles)).toBe(2);
    }
  });

  it('exactly 3 operators [min=3, max=3] — 14 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 3, max: 3 } });
    for (const p of genN('cross', 14, adv)) {
      expect(countOps(p.solutionTiles)).toBe(3);
    }
  });

  it('range [1, 3] — 12 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 1, max: 3 } });
    for (const p of genN('cross', 12, adv)) {
      const ops = countOps(p.solutionTiles);
      expect(ops).toBeGreaterThanOrEqual(1);
      expect(ops).toBeLessThanOrEqual(3);
    }
  });

  it('range [2, 4] — 15 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 2, max: 4 } });
    for (const p of genN('cross', 15, adv)) {
      const ops = countOps(p.solutionTiles);
      expect(ops).toBeGreaterThanOrEqual(2);
      expect(ops).toBeLessThanOrEqual(4);
    }
  });
});

// =============================================================================
// 3. heavyCount constraint
// =============================================================================

describe('generateBingo — heavyCount constraint', () => {
  const H = (min, max) => ({ enabled: true, min, max, placementEnabled: false, locked: 0, onRack: 0 });

  it('exactly 0 heavy tiles — 9 tiles', () => {
    const adv = buildAdv({ heavyCount: H(0, 0) });
    for (const p of genN('cross', 9, adv)) {
      expect(countHeavy(p.solutionTiles)).toBe(0);
    }
  });

  it('at least 1 heavy tile [1, 2] — 12 tiles', () => {
    const adv = buildAdv({ heavyCount: H(1, 2) });
    for (const p of genN('cross', 12, adv)) {
      const h = countHeavy(p.solutionTiles);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(2);
    }
  });

  it('exactly 1 heavy tile — 11 tiles', () => {
    const adv = buildAdv({ heavyCount: H(1, 1) });
    for (const p of genN('cross', 11, adv)) {
      expect(countHeavy(p.solutionTiles)).toBe(1);
    }
  });

  it('exactly 2 heavy tiles — 14 tiles', () => {
    const adv = buildAdv({ heavyCount: H(2, 2) });
    for (const p of genN('cross', 14, adv)) {
      expect(countHeavy(p.solutionTiles)).toBe(2);
    }
  });

  it('range [0, 3] — 15 tiles', () => {
    const adv = buildAdv({ heavyCount: H(0, 3) });
    for (const p of genN('cross', 15, adv)) {
      expect(countHeavy(p.solutionTiles)).toBeLessThanOrEqual(3);
    }
  });
});

// =============================================================================
// 4. blankCount constraint
// =============================================================================

describe('generateBingo — blankCount constraint', () => {
  const B = (min, max) => ({ enabled: true, min, max, placementEnabled: false, locked: 0, onRack: 0 });

  it('exactly 0 blanks — 10 tiles', () => {
    const adv = buildAdv({ blankCount: B(0, 0) });
    for (const p of genN('cross', 10, adv)) {
      expect(countBlanks(p.solutionTiles)).toBe(0);
    }
  });

  it('exactly 1 blank — 12 tiles', () => {
    const adv = buildAdv({ blankCount: B(1, 1) });
    for (const p of genN('cross', 12, adv)) {
      expect(countBlanks(p.solutionTiles)).toBe(1);
    }
  });

  it('range [0, 2] — 11 tiles', () => {
    const adv = buildAdv({ blankCount: B(0, 2) });
    for (const p of genN('cross', 11, adv)) {
      const b = countBlanks(p.solutionTiles);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(2);
    }
  });

  it('exactly 2 blanks — 14 tiles', () => {
    const adv = buildAdv({ blankCount: B(2, 2) });
    for (const p of genN('cross', 14, adv)) {
      expect(countBlanks(p.solutionTiles)).toBe(2);
    }
  });
});

// =============================================================================
// 5. Per-operator constraints — operatorSpec
// =============================================================================

describe('generateBingo — operatorSpec per-operator', () => {
  // Core operators: each one set to exactly 1
  for (const op of ['+', '-', '×', '÷']) {
    it(`exactly 1 "${op}" — 9 tiles`, () => {
      const adv = buildAdv({ operatorSpec: { [op]: opEntry(1, 1) } });
      for (const p of genN('cross', 9, adv)) {
        expect(countOp(p.solutionTiles, op)).toBe(1);
      }
    });
  }

  // Choice operators
  it('exactly 1 "+/-" — 9 tiles', () => {
    const adv = buildAdv({ operatorSpec: { '+/-': opEntry(1, 1) } });
    for (const p of genN('cross', 9, adv)) {
      expect(countOp(p.solutionTiles, '+/-')).toBe(1);
    }
  });

  it('exactly 1 "×/÷" — 9 tiles', () => {
    const adv = buildAdv({ operatorSpec: { '×/÷': opEntry(1, 1) } });
    for (const p of genN('cross', 9, adv)) {
      expect(countOp(p.solutionTiles, '×/÷')).toBe(1);
    }
  });

  // Zero count (exclusion)
  it('zero "-" operators [max=0] — 10 tiles', () => {
    const adv = buildAdv({ operatorSpec: { '-': opEntry(0, 0) } });
    for (const p of genN('cross', 10, adv)) {
      expect(countOp(p.solutionTiles, '-')).toBe(0);
    }
  });

  it('zero "÷" operators [max=0] — 10 tiles', () => {
    const adv = buildAdv({ operatorSpec: { '÷': opEntry(0, 0) } });
    for (const p of genN('cross', 10, adv)) {
      expect(countOp(p.solutionTiles, '÷')).toBe(0);
    }
  });

  // Multiple of one operator
  it('at least 2 "+" operators [min=2, max=4] — 14 tiles', () => {
    const adv = buildAdv({ operatorSpec: { '+': opEntry(2, 4) } });
    for (const p of genN('cross', 14, adv)) {
      const c = countOp(p.solutionTiles, '+');
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(4);
    }
  });

  // Both min operators required together
  it('1 "×" AND 1 "÷" required — 12 tiles', () => {
    const adv = buildAdv({
      operatorSpec: {
        '×': opEntry(1, 2),
        '÷': opEntry(1, 2),
      },
    });
    for (const p of genN('cross', 12, adv, 3)) {
      expect(countOp(p.solutionTiles, '×')).toBeGreaterThanOrEqual(1);
      expect(countOp(p.solutionTiles, '÷')).toBeGreaterThanOrEqual(1);
    }
  });
});

// =============================================================================
// 6. Combined constraints
// =============================================================================

describe('generateBingo — combined constraints', () => {
  it('operatorCount=2 + heavyCount=1 — 13 tiles', () => {
    const adv = buildAdv({
      operatorCount: { enabled: true, min: 2, max: 2 },
      heavyCount: { enabled: true, min: 1, max: 1, placementEnabled: false, locked: 0, onRack: 0 },
    });
    for (const p of genN('cross', 13, adv, 3)) {
      expect(countOps(p.solutionTiles)).toBe(2);
      expect(countHeavy(p.solutionTiles)).toBe(1);
    }
  });

  it('specific "+" allowed + "-" excluded — 10 tiles', () => {
    const adv = buildAdv({
      operatorSpec: {
        '+': opEntry(1, 2),
        '-': opEntry(0, 0),
      },
    });
    for (const p of genN('cross', 10, adv)) {
      const plusCount = countOp(p.solutionTiles, '+');
      expect(plusCount).toBeGreaterThanOrEqual(1);
      expect(plusCount).toBeLessThanOrEqual(2);
      expect(countOp(p.solutionTiles, '-')).toBe(0);
    }
  });

  it('heavyCount=1 + blankCount=1 — 14 tiles', () => {
    const adv = buildAdv({
      heavyCount: { enabled: true, min: 1, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
      blankCount: { enabled: true, min: 1, max: 1, placementEnabled: false, locked: 0, onRack: 0 },
    });
    for (const p of genN('cross', 14, adv, 3)) {
      expect(countHeavy(p.solutionTiles)).toBeGreaterThanOrEqual(1);
      expect(countBlanks(p.solutionTiles)).toBe(1);
    }
  });

  it('operatorCount=2 + specific ops + no "-" — 12 tiles', () => {
    const adv = buildAdv({
      operatorCount: { enabled: true, min: 2, max: 2 },
      operatorSpec: {
        '+': opEntry(1, 1),
        '-': opEntry(0, 0),
      },
    });
    for (const p of genN('cross', 12, adv, 3)) {
      expect(countOps(p.solutionTiles)).toBe(2);
      expect(countOp(p.solutionTiles, '+')).toBe(1);
      expect(countOp(p.solutionTiles, '-')).toBe(0);
    }
  });

  it('heavyCount=1 + operatorSpec "×" min=1 — 13 tiles', () => {
    const adv = buildAdv({
      heavyCount: { enabled: true, min: 1, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
      operatorSpec: { '×': opEntry(1, 2) },
    });
    for (const p of genN('cross', 13, adv, 3)) {
      expect(countHeavy(p.solutionTiles)).toBeGreaterThanOrEqual(1);
      expect(countOp(p.solutionTiles, '×')).toBeGreaterThanOrEqual(1);
    }
  });
});

// =============================================================================
// 7. Cross mode — locked tile counts for every tile count 8–15
// =============================================================================

describe('generateBingo — cross mode locked placement counts', () => {
  for (const tileCount of [8, 9, 10, 11, 12, 13, 14, 15]) {
    it(`${tileCount} tiles → ${Math.max(0, tileCount - 8)} locked on board`, () => {
      const lockCount = Math.max(0, tileCount - 8);
      for (let i = 0; i < 3; i++) {
        const p = gen('cross', tileCount);
        expect(p.boardSlots.filter(s => s.isLocked)).toHaveLength(lockCount);
        expect(p.rackTiles).toHaveLength(8);
      }
    });
  }
});

// =============================================================================
// 8. Placement constraints — tileAssignmentSpec (cross mode only)
// =============================================================================

describe('generateBingo — tileAssignmentSpec placement constraints', () => {
  it('"+" operator: lock=1 forces at least 1 "+" on board — 12 tiles', () => {
    const adv = buildAdv({
      operatorSpec: {
        '+': opEntry(2, 3, { placementEnabled: true, locked: 1, onRack: 0 }),
      },
    });
    for (const p of genN('cross', 12, adv, 3)) {
      // Must have ≥ 2 '+' tiles
      expect(countOp(p.solutionTiles, '+')).toBeGreaterThanOrEqual(2);
      // At least 1 '+' must be locked
      const lockedPlus = p.boardSlots.filter(s => s.isLocked && s.tile === '+').length;
      expect(lockedPlus).toBeGreaterThanOrEqual(1);
    }
  });

  it('"+" operator: rack=1 forces at least 1 "+" in rack — 12 tiles', () => {
    const adv = buildAdv({
      operatorSpec: {
        '+': opEntry(2, 3, { placementEnabled: true, locked: 0, onRack: 1 }),
      },
    });
    for (const p of genN('cross', 12, adv, 3)) {
      expect(countOp(p.solutionTiles, '+')).toBeGreaterThanOrEqual(2);
      const rackPlus = p.rackTiles.filter(t => t === '+').length;
      expect(rackPlus).toBeGreaterThanOrEqual(1);
    }
  });

  it('heavy tiles: lock=1 forces at least 1 heavy on board — 14 tiles', () => {
    const adv = buildAdv({
      heavyCount: {
        enabled: true, min: 2, max: 3,
        placementEnabled: true, locked: 1, onRack: 0,
      },
    });
    for (const p of genN('cross', 14, adv, 3)) {
      expect(countHeavy(p.solutionTiles)).toBeGreaterThanOrEqual(2);
      const lockedHeavy = p.boardSlots.filter(s => s.isLocked && HEAVY_SET.has(s.tile)).length;
      expect(lockedHeavy).toBeGreaterThanOrEqual(1);
    }
  });

  it('blank tiles: rack=1 forces at least 1 "?" in rack — 14 tiles', () => {
    const adv = buildAdv({
      blankCount: {
        enabled: true, min: 2, max: 2,
        placementEnabled: true, locked: 0, onRack: 1,
      },
    });
    for (const p of genN('cross', 14, adv, 3)) {
      expect(countBlanks(p.solutionTiles)).toBe(2);
      const rackBlanks = p.rackTiles.filter(t => t === '?').length;
      expect(rackBlanks).toBeGreaterThanOrEqual(1);
    }
  });
});

// =============================================================================
// 9. Plain mode — constraints
// =============================================================================

describe('generateBingo — plain mode constraints', () => {
  it('operatorCount [1, 2] — 10 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 1, max: 2 } });
    for (const p of genN('plain', 10, adv)) {
      const ops = countOps(p.solutionTiles);
      expect(ops).toBeGreaterThanOrEqual(1);
      expect(ops).toBeLessThanOrEqual(2);
    }
  });

  it('operatorCount [2, 2] — 13 tiles', () => {
    const adv = buildAdv({ operatorCount: { enabled: true, min: 2, max: 2 } });
    for (const p of genN('plain', 13, adv)) {
      expect(countOps(p.solutionTiles)).toBe(2);
    }
  });

  it('heavyCount [1, 2] — 11 tiles', () => {
    const adv = buildAdv({
      heavyCount: { enabled: true, min: 1, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
    });
    for (const p of genN('plain', 11, adv)) {
      const h = countHeavy(p.solutionTiles);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(2);
    }
  });

  it('blankCount [1, 1] — 12 tiles', () => {
    const adv = buildAdv({
      blankCount: { enabled: true, min: 1, max: 1, placementEnabled: false, locked: 0, onRack: 0 },
    });
    for (const p of genN('plain', 12, adv)) {
      expect(countBlanks(p.solutionTiles)).toBe(1);
    }
  });

  it('operatorSpec "÷" min=1 — 12 tiles', () => {
    const adv = buildAdv({ operatorSpec: { '÷': opEntry(1, 2) } });
    for (const p of genN('plain', 12, adv)) {
      expect(countOp(p.solutionTiles, '÷')).toBeGreaterThanOrEqual(1);
    }
  });

  it('all tile counts 8-15 generate valid plain puzzles', () => {
    for (const tileCount of [8, 9, 10, 11, 12, 13, 14, 15]) {
      const p = gen('plain', tileCount);
      expect(p.solutionTiles).toHaveLength(tileCount);
      expect(p.rackTiles).toHaveLength(tileCount);
      expect(p.boardSlots.every(s => !s.isLocked)).toBe(true);
    }
  });
});

// =============================================================================
// 10. Equation validity — rackTiles + lockedTiles reconstructs solutionTiles
// =============================================================================

describe('generateBingo — solutionTiles consistency', () => {
  it('cross: rackTiles + locked boardSlot tiles = solutionTiles (same multiset)', () => {
    for (let i = 0; i < 5; i++) {
      const tileCount = 8 + (i % 8);
      const p = gen('cross', tileCount);

      const fromBoard = p.boardSlots.filter(s => s.isLocked).map(s => s.tile);
      const combined  = [...fromBoard, ...p.rackTiles].sort();
      const expected  = [...p.solutionTiles].sort();

      expect(combined).toEqual(expected);
    }
  });

  it('plain: rackTiles matches solutionTiles (same multiset, shuffled)', () => {
    for (let i = 0; i < 5; i++) {
      const tileCount = 8 + (i % 8);
      const p = gen('plain', tileCount);
      expect([...p.rackTiles].sort()).toEqual([...p.solutionTiles].sort());
    }
  });
});
