/**
 * tileAssignment.test.js
 *
 * Tests for:
 *   1. buildGeneratorConfig  — BingoAdvancedConfig.jsx
 *   2. applyTileAssignmentToPlacement — bingoGenerator.js
 *
 * Run:  npm test
 */

import { describe, it, expect } from 'vitest';
import { buildGeneratorConfig, DEFAULT_ADV_CFG } from '@/components/bingo/BingoAdvancedConfig.jsx';
import { applyTileAssignmentToPlacement, HEAVY_SET } from '@/lib/bingoGenerator.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal placement stub with equal slotProbs */
function makePlacement(n, slotProbs = null) {
  return {
    slotProbs: slotProbs ?? Array(n).fill(1 / n),
    rowIdx: 0, colStart: 0, dir: 'H',
    rowSlots: Array(n).fill('px1'),
    cells: Array.from({ length: n }, (_, i) => ({ r: 0, c: i, type: 'px1' })),
  };
}

/** Count tiles of a specific type in solutionTiles at given indices */
function countTypeAtIndices(solutionTiles, indices, type) {
  return indices.filter(i => solutionTiles[i] === type).length;
}

/** Count heavy tiles at given indices */
function countHeavyAtIndices(solutionTiles, indices) {
  return indices.filter(i => HEAVY_SET.has(solutionTiles[i])).length;
}

// ─── 1. buildGeneratorConfig ──────────────────────────────────────────────────

describe('buildGeneratorConfig', () => {
  it('returns base cfg with mode and totalTile when all disabled', () => {
    const cfg = buildGeneratorConfig('cross', 9, DEFAULT_ADV_CFG);
    expect(cfg.mode).toBe('cross');
    expect(cfg.totalTile).toBe(9);
    expect(cfg.operatorSpec).toBeUndefined();
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });

  it('includes operatorCount when enabled', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      operatorCount: { enabled: true, min: 2, max: 4 },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.operatorCount).toEqual([2, 4]);
  });

  it('includes heavyCount when enabled', () => {
    const adv = { ...DEFAULT_ADV_CFG, heavyCount: { enabled: true, min: 1, max: 3, placementEnabled: false, locked: 0, onRack: 0 } };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.heavyCount).toEqual([1, 3]);
  });

  it('includes blankCount when enabled', () => {
    const adv = { ...DEFAULT_ADV_CFG, blankCount: { enabled: true, min: 0, max: 2, placementEnabled: false, locked: 0, onRack: 0 } };
    const cfg = buildGeneratorConfig('plain', 9, adv);
    expect(cfg.blankCount).toEqual([0, 2]);
  });

  it('does NOT include equalCount for non-expand mode', () => {
    const adv = { ...DEFAULT_ADV_CFG, equalCount: { enabled: true, value: 2 } };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.equalCount).toBeUndefined();
  });

  it('includes equalCount only for expand mode', () => {
    const adv = { ...DEFAULT_ADV_CFG, equalCount: { enabled: true, value: 2 } };
    const cfg = buildGeneratorConfig('expand', 9, adv);
    expect(cfg.equalCount).toBe(2);
  });

  it('includes operatorSpec for enabled operators', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      operatorSpec: {
        ...DEFAULT_ADV_CFG.operatorSpec,
        '+': { enabled: true, min: 2, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
        '-': { enabled: true, min: 0, max: 0, placementEnabled: false, locked: 0, onRack: 0 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.operatorSpec['+']).toEqual([2, 2]);
    expect(cfg.operatorSpec['-']).toEqual([0, 0]);
    expect(cfg.operatorSpec['×']).toBeUndefined();
  });

  it('adds tileAssignmentSpec for operator with placementEnabled', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      operatorSpec: {
        ...DEFAULT_ADV_CFG.operatorSpec,
        '+': { enabled: true, min: 2, max: 2, placementEnabled: true, locked: 1, onRack: 1 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 10, adv);
    expect(cfg.tileAssignmentSpec['+']).toEqual({ locked: 1, onRack: 1 });
  });

  it('does NOT add tileAssignmentSpec when operator not enabled', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      operatorSpec: {
        ...DEFAULT_ADV_CFG.operatorSpec,
        '+': { enabled: false, min: 2, max: 2, placementEnabled: true, locked: 1, onRack: 1 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 10, adv);
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });

  it('adds __heavy__ to tileAssignmentSpec when heavyCount has placementEnabled', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      heavyCount: { enabled: true, min: 1, max: 2, placementEnabled: true, locked: 1, onRack: 0 },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.tileAssignmentSpec['__heavy__']).toEqual({ locked: 1, onRack: 0 });
  });

  it('adds ? to tileAssignmentSpec when blankCount has placementEnabled', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      blankCount: { enabled: true, min: 1, max: 2, placementEnabled: true, locked: 0, onRack: 1 },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.tileAssignmentSpec['?']).toEqual({ locked: 0, onRack: 1 });
  });

  it('complex example: 10-tile, + disabled -, disabled +/-, +: 2 (lock1 rack1)', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      operatorCount: { enabled: true, min: 4, max: 4 },
      operatorSpec: {
        ...DEFAULT_ADV_CFG.operatorSpec,
        '+':   { enabled: true, min: 2, max: 2, placementEnabled: true, locked: 1, onRack: 1 },
        '-':   { enabled: true, min: 0, max: 0, placementEnabled: false, locked: 0, onRack: 0 },
        '+/-': { enabled: true, min: 0, max: 0, placementEnabled: false, locked: 0, onRack: 0 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 10, adv);
    expect(cfg.totalTile).toBe(10);
    expect(cfg.operatorCount).toEqual([4, 4]);
    expect(cfg.operatorSpec['+']).toEqual([2, 2]);
    expect(cfg.operatorSpec['-']).toEqual([0, 0]);
    expect(cfg.operatorSpec['+/-']).toEqual([0, 0]);
    expect(cfg.operatorSpec['×']).toBeUndefined();
    expect(cfg.tileAssignmentSpec['+']).toEqual({ locked: 1, onRack: 1 });
    expect(cfg.tileAssignmentSpec['-']).toBeUndefined();   // placement disabled
    expect(cfg.tileAssignmentSpec['+/-']).toBeUndefined(); // placement disabled
  });
});

// ─── 2. applyTileAssignmentToPlacement ───────────────────────────────────────

describe('applyTileAssignmentToPlacement', () => {
  it('returns placement unchanged when tileAssignmentSpec is null', () => {
    const tiles = ['+', '-', '1', '2', '=', '3'];
    const p = makePlacement(tiles.length);
    const out = applyTileAssignmentToPlacement(tiles, p, null);
    expect(out).toBe(p); // same reference
  });

  it('returns placement unchanged when tileAssignmentSpec is empty object', () => {
    const tiles = ['+', '-', '1', '=', '2'];
    const p = makePlacement(tiles.length);
    const out = applyTileAssignmentToPlacement(tiles, p, {});
    expect(out).toBe(p);
  });

  it('forces exactly locked=1 for "+" when there are 2 "+" tiles', () => {
    // solutionTiles: ['+', '+', '1', '2', '3', '=', '4', '5', '6', '-']
    const tiles = ['+', '+', '1', '2', '3', '=', '4', '5', '6', '-'];
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: 1, onRack: 1 } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    // Indices of '+' are 0 and 1
    // One should be 2 (mustLock), the other 0 (excluded/rack)
    const plusProbs = [out.slotProbs[0], out.slotProbs[1]].sort((a, b) => b - a);
    expect(plusProbs[0]).toBe(2);  // one forced lock
    expect(plusProbs[1]).toBe(0);  // one forced rack
  });

  it('forces all tiles of a type to rack when locked=0', () => {
    const tiles = ['+', '+', '1', '=', '2'];
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: 0, onRack: null } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    // Both '+' indices (0,1) should be 0 (rack)
    expect(out.slotProbs[0]).toBe(0);
    expect(out.slotProbs[1]).toBe(0);
  });

  it('forces all tiles of a type to lock when locked = total count', () => {
    const tiles = ['×', '÷', '1', '=', '2'];
    const p = makePlacement(tiles.length);
    const spec = { '×': { locked: 1, onRack: null } }; // only 1 × tile
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[0]).toBe(2); // × at index 0 forced lock
  });

  it('handles onRack-only spec: derives locked = total - onRack', () => {
    const tiles = ['-', '-', '-', '1', '=', '2']; // 3 '-' tiles
    const p = makePlacement(tiles.length);
    const spec = { '-': { locked: null, onRack: 1 } }; // rack=1 → lock=2
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    const dashProbs = [out.slotProbs[0], out.slotProbs[1], out.slotProbs[2]];
    const forcedLocks = dashProbs.filter(v => v === 2).length;
    const forcedRacks = dashProbs.filter(v => v === 0).length;
    expect(forcedLocks).toBe(2);
    expect(forcedRacks).toBe(1);
  });

  it('handles __heavy__ key for heavy tiles (10-20)', () => {
    const tiles = ['10', '15', '+', '1', '=', '25']; // '25' is NOT heavy (>20)
    const p = makePlacement(tiles.length);
    const spec = { '__heavy__': { locked: 1, onRack: null } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    // Heavy tiles: index 0 ('10') and index 1 ('15')
    const heavyProbs = [out.slotProbs[0], out.slotProbs[1]].sort((a, b) => b - a);
    expect(heavyProbs[0]).toBe(2); // one forced lock
    expect(heavyProbs[1]).toBe(0); // one forced rack
  });

  it('handles "?" key for blank tiles', () => {
    const tiles = ['?', '+', '1', '=', '2', '?'];
    const p = makePlacement(tiles.length);
    const spec = { '?': { locked: 0, onRack: null } }; // all blanks on rack
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[0]).toBe(0); // ? at index 0
    expect(out.slotProbs[5]).toBe(0); // ? at index 5
  });

  it('does not modify non-constrained tile probs', () => {
    const tiles = ['+', '1', '=', '2', '-'];
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: 1, onRack: null } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    // Indices 1,2,3,4 are not '+', should retain original probs
    expect(out.slotProbs[1]).toBeCloseTo(1 / 5);
    expect(out.slotProbs[2]).toBeCloseTo(1 / 5);
    expect(out.slotProbs[3]).toBeCloseTo(1 / 5);
    expect(out.slotProbs[4]).toBeCloseTo(1 / 5);
  });

  it('caps locked count to available tiles (locked > total count)', () => {
    const tiles = ['+', '1', '=', '2', '-']; // only 1 '+' tile
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: 5, onRack: null } }; // can only lock 1
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[0]).toBe(2); // capped to 1 lock
  });

  it('caps onRack to available tiles when onRack > total count', () => {
    const tiles = ['+', '1', '=', '2', '-']; // only 1 '+' tile
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: null, onRack: 5 } }; // locked = max(0, 1-5) = 0
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[0]).toBe(0); // 0 locked → all on rack
  });

  it('handles missing tile type gracefully (type not in solutionTiles)', () => {
    const tiles = ['1', '+', '=', '2'];
    const p = makePlacement(tiles.length);
    const spec = { '÷': { locked: 2, onRack: null } }; // no ÷ in tiles
    expect(() => {
      applyTileAssignmentToPlacement(tiles, p, spec);
    }).not.toThrow();
    // slotProbs should be unchanged
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    out.slotProbs.forEach((prob, i) => {
      expect(prob).toBeCloseTo(1 / 4);
    });
  });

  it('handles both locked and onRack specified: locked takes priority', () => {
    const tiles = ['+', '+', '+', '1', '=', '2']; // 3 '+' tiles
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: 2, onRack: 3 } }; // locked=2 wins, 1 on rack
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    const plusProbs = [out.slotProbs[0], out.slotProbs[1], out.slotProbs[2]];
    const forcedLocks = plusProbs.filter(v => v === 2).length;
    const forcedRacks = plusProbs.filter(v => v === 0).length;
    expect(forcedLocks).toBe(2);
    expect(forcedRacks).toBe(1);
  });

  it('multiple specs applied independently', () => {
    const tiles = ['+', '-', '+', '-', '1', '=', '2'];
    const p = makePlacement(tiles.length);
    const spec = {
      '+': { locked: 1, onRack: null }, // 1 of 2 '+' locked
      '-': { locked: 0, onRack: null }, // all '-' on rack
    };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    const plusProbs = [out.slotProbs[0], out.slotProbs[2]].sort((a, b) => b - a);
    expect(plusProbs[0]).toBe(2); // 1 '+' forced lock
    expect(plusProbs[1]).toBe(0); // 1 '+' forced rack
    expect(out.slotProbs[1]).toBe(0); // '-' forced rack
    expect(out.slotProbs[3]).toBe(0); // '-' forced rack
  });

  it('preserves original slotProbs reference (returns new object)', () => {
    const tiles = ['+', '1', '=', '2'];
    const p = makePlacement(tiles.length);
    const spec = { '+': { locked: 1, onRack: null } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out).not.toBe(p);
    // Original placement unchanged
    expect(p.slotProbs[0]).toBeCloseTo(0.25);
  });

  it('handles custom slotProbs (not equal distribution)', () => {
    const tiles = ['+', '-', '1', '=', '2'];
    const p = makePlacement(tiles.length, [0.5, 0.3, 0.1, 0.05, 0.05]);
    const spec = { '+': { locked: 1, onRack: null } }; // '+' at index 0 → forced lock
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[0]).toBe(2);
    // Others unchanged
    expect(out.slotProbs[1]).toBeCloseTo(0.3);
    expect(out.slotProbs[2]).toBeCloseTo(0.1);
  });
});

// ─── 3. DEFAULT_ADV_CFG shape ─────────────────────────────────────────────────

describe('DEFAULT_ADV_CFG', () => {
  const OP_SYMBOLS = ['+', '-', '×', '÷', '+/-', '×/÷'];

  it('has all required top-level keys', () => {
    expect(DEFAULT_ADV_CFG).toHaveProperty('operatorCount');
    expect(DEFAULT_ADV_CFG).toHaveProperty('heavyCount');
    expect(DEFAULT_ADV_CFG).toHaveProperty('equalCount');
    expect(DEFAULT_ADV_CFG).toHaveProperty('blankCount');
    expect(DEFAULT_ADV_CFG).toHaveProperty('operatorSpec');
  });

  it('has all operator types in operatorSpec', () => {
    for (const op of OP_SYMBOLS) {
      expect(DEFAULT_ADV_CFG.operatorSpec).toHaveProperty(op);
    }
  });

  it('each operatorSpec entry has placement fields', () => {
    for (const op of OP_SYMBOLS) {
      const spec = DEFAULT_ADV_CFG.operatorSpec[op];
      expect(spec).toHaveProperty('placementEnabled', false);
      expect(spec).toHaveProperty('locked', 0);
      expect(spec).toHaveProperty('onRack', 0);
    }
  });

  it('heavyCount and blankCount have placement fields', () => {
    expect(DEFAULT_ADV_CFG.heavyCount).toHaveProperty('placementEnabled', false);
    expect(DEFAULT_ADV_CFG.heavyCount).toHaveProperty('locked', 0);
    expect(DEFAULT_ADV_CFG.heavyCount).toHaveProperty('onRack', 0);
    expect(DEFAULT_ADV_CFG.blankCount).toHaveProperty('placementEnabled', false);
    expect(DEFAULT_ADV_CFG.blankCount).toHaveProperty('locked', 0);
    expect(DEFAULT_ADV_CFG.blankCount).toHaveProperty('onRack', 0);
  });

  it('all defaults are disabled (no active constraints)', () => {
    const cfg = buildGeneratorConfig('cross', 9, DEFAULT_ADV_CFG);
    expect(cfg.operatorSpec).toBeUndefined();
    expect(cfg.tileAssignmentSpec).toBeUndefined();
    expect(cfg.heavyCount).toBeUndefined();
    expect(cfg.blankCount).toBeUndefined();
    expect(cfg.operatorCount).toBeUndefined();
  });
});
