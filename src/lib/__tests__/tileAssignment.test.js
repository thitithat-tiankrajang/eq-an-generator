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
import {
  buildGeneratorConfig,
  DEFAULT_ADV_CFG,
  __test_deepUpdate as deepUpdate,
} from '@/components/bingo/BingoAdvancedConfig.jsx';
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

// ─── 4. Per-digit placement (0-9) ────────────────────────────────────────────
//
// Mirrors the heavy / blank / operator placement plumbing but for individual
// digit tiles.  The generator side already accepts any literal-tile key in
// `tileAssignmentSpec` (see applyTileAssignmentToPlacement's `catOf` —
// non-heavy tiles map to themselves) so the wiring is config-only: when a
// digit's `digitSpec[d].enabled` is true, buildGeneratorConfig must emit
// `tileAssignmentSpec[d] = { locked, onRack }`.

describe('digitSpec — buildGeneratorConfig', () => {
  it('DEFAULT_ADV_CFG has digitSpec for every digit 0-9, all disabled', () => {
    expect(DEFAULT_ADV_CFG.digitSpec).toBeDefined();
    for (let d = 0; d <= 9; d++) {
      const entry = DEFAULT_ADV_CFG.digitSpec[String(d)];
      expect(entry).toBeDefined();
      expect(entry.enabled).toBe(false);
      expect(entry.locked).toBe(0);
      expect(entry.onRack).toBe(0);
    }
  });

  it('does NOT emit tileAssignmentSpec for digit when digitSpec[d].enabled is false', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      digitSpec: {
        ...DEFAULT_ADV_CFG.digitSpec,
        '5': { enabled: false, locked: 2, onRack: 1 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    // No tileAssignmentSpec at all because no slot is enabled
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });

  it('emits tileAssignmentSpec[d] when digitSpec[d].enabled is true', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      digitSpec: {
        ...DEFAULT_ADV_CFG.digitSpec,
        '7': { enabled: true, locked: 1, onRack: 2 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 11, adv);
    expect(cfg.tileAssignmentSpec['7']).toEqual({ locked: 1, onRack: 2 });
  });

  it('emits multiple digit entries when several are enabled', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      digitSpec: {
        ...DEFAULT_ADV_CFG.digitSpec,
        '0': { enabled: true, locked: 0, onRack: 1 },
        '3': { enabled: true, locked: 2, onRack: 0 },
        '9': { enabled: true, locked: 1, onRack: 1 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 12, adv);
    expect(cfg.tileAssignmentSpec['0']).toEqual({ locked: 0, onRack: 1 });
    expect(cfg.tileAssignmentSpec['3']).toEqual({ locked: 2, onRack: 0 });
    expect(cfg.tileAssignmentSpec['9']).toEqual({ locked: 1, onRack: 1 });
    // Disabled digits don't appear
    expect(cfg.tileAssignmentSpec['1']).toBeUndefined();
    expect(cfg.tileAssignmentSpec['5']).toBeUndefined();
  });

  it('digitSpec composes with heavy/blank/operator placement in one tileAssignmentSpec', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      heavyCount:  { enabled: true, min: 1, max: 1, placementEnabled: true, locked: 1, onRack: 0 },
      blankCount:  { enabled: true, min: 1, max: 1, placementEnabled: true, locked: 0, onRack: 1 },
      operatorSpec: {
        ...DEFAULT_ADV_CFG.operatorSpec,
        '+': { enabled: true, min: 1, max: 2, placementEnabled: true, locked: 1, onRack: 0 },
      },
      digitSpec: {
        ...DEFAULT_ADV_CFG.digitSpec,
        '4': { enabled: true, locked: 1, onRack: 0 },
      },
    };
    const cfg = buildGeneratorConfig('cross', 12, adv);
    expect(cfg.tileAssignmentSpec['__heavy__']).toEqual({ locked: 1, onRack: 0 });
    expect(cfg.tileAssignmentSpec['?']).toEqual({ locked: 0, onRack: 1 });
    expect(cfg.tileAssignmentSpec['+']).toEqual({ locked: 1, onRack: 0 });
    expect(cfg.tileAssignmentSpec['4']).toEqual({ locked: 1, onRack: 0 });
  });

  it('treats absent digitSpec gracefully (back-compat with older saved configs)', () => {
    const adv = { ...DEFAULT_ADV_CFG };
    delete adv.digitSpec;
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });
});

// ─── 5. __normal__ aggregate placement (any 0-9 light digit) ──────────────
//
// The "Normal Tile" UX entry point — user picks "lock N + rack M light
// digits, system randomises which".  Implemented as a synthetic
// `__normal__` key in tileAssignmentSpec.  Loose semantic: only lock+rack
// tiles are pinned, the rest stay free.  Per-digit specs take precedence:
// a digit position already claimed by digitSpec[d] is removed from the
// __normal__ candidate pool.

describe('normalTileCount — buildGeneratorConfig', () => {
  it('DEFAULT_ADV_CFG has normalTileCount disabled with zero counts', () => {
    expect(DEFAULT_ADV_CFG.normalTileCount).toEqual({
      placementEnabled: false,
      locked: 0,
      onRack: 0,
    });
  });

  it('emits tileAssignmentSpec.__normal__ when placementEnabled is true', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      normalTileCount: { placementEnabled: true, locked: 2, onRack: 1 },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.tileAssignmentSpec['__normal__']).toEqual({ locked: 2, onRack: 1 });
  });

  it('omits __normal__ when placementEnabled is false (even with non-zero counts)', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      normalTileCount: { placementEnabled: false, locked: 2, onRack: 1 },
    };
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });

  it('__normal__ composes with per-digit + heavy placement', () => {
    const adv = {
      ...DEFAULT_ADV_CFG,
      heavyCount:  { enabled: true, min: 1, max: 1, placementEnabled: true, locked: 1, onRack: 0 },
      digitSpec: {
        ...DEFAULT_ADV_CFG.digitSpec,
        '7': { enabled: true, locked: 1, onRack: 0 },
      },
      normalTileCount: { placementEnabled: true, locked: 1, onRack: 2 },
    };
    const cfg = buildGeneratorConfig('cross', 12, adv);
    expect(cfg.tileAssignmentSpec['__heavy__']).toEqual({ locked: 1, onRack: 0 });
    expect(cfg.tileAssignmentSpec['7']).toEqual({ locked: 1, onRack: 0 });
    expect(cfg.tileAssignmentSpec['__normal__']).toEqual({ locked: 1, onRack: 2 });
  });

  it('back-compat: absent normalTileCount does not emit __normal__', () => {
    const adv = { ...DEFAULT_ADV_CFG };
    delete adv.normalTileCount;
    const cfg = buildGeneratorConfig('cross', 9, adv);
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });
});

describe('__normal__ — applyTileAssignmentToPlacement', () => {
  it('pins exactly `locked` light digits + zeros operators/= when satisfiable', () => {
    // 8-tile equation 1+2+3=15 → tiles: 1 + 2 + 3 = 1 5
    //   light positions: 0, 2, 4, 6, 7 (5 candidates)
    //   adjacent pair: 6-7 (both lights — only one can lock)
    //   non-adjacent pickable: {0, 2, 4, 6} or {0, 2, 4, 7} → max 4
    // Spec: lock=2, rack=1 → fully satisfiable (2 non-adjacent picks easy).
    const tiles = ['1', '+', '2', '+', '3', '=', '1', '5'];
    const p = makePlacement(tiles.length);
    const origProb = 1 / tiles.length;

    const spec = { '__normal__': { locked: 2, onRack: 1 } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    const lightIdx = [0, 2, 4, 6, 7];
    const probs = lightIdx.map(i => out.slotProbs[i]);
    const lockN = probs.filter(v => v === 2).length;
    const rackN = probs.filter(v => v === 0).length;
    const freeN = probs.filter(v => v !== 0 && v !== 2).length;
    expect(lockN).toBe(2);
    expect(rackN).toBe(1);
    expect(freeN).toBe(2);  // 5 candidates - 2 lock - 1 rack = 2 leftover lights

    // Leftover lights keep their default placement prob (loose semantic)
    probs.filter(v => v !== 0 && v !== 2).forEach(v => {
      expect(v).toBeCloseTo(origProb);
    });

    // Operator-shield ON (target fully satisfied): operators + '=' → 0
    // so selectLockPositions can't pick them as fills.  This is the
    // user-visible behaviour change vs the original loose semantic and is
    // what fixes "operator gets locked instead of digit".
    expect(out.slotProbs[1]).toBe(0);  // '+'
    expect(out.slotProbs[3]).toBe(0);  // '+'
    expect(out.slotProbs[5]).toBe(0);  // '='

    // No two pinned-locks adjacent (selectLockPositions would prune one)
    const pinnedLockIdx = out.slotProbs
      .map((v, idx) => v === 2 ? idx : -1)
      .filter(idx => idx >= 0);
    const sorted = [...pinnedLockIdx].sort((a, b) => a - b);
    for (let j = 1; j < sorted.length; j++) {
      expect(sorted[j] - sorted[j - 1]).toBeGreaterThan(1);
    }
  });

  it('does NOT pin heavy tiles even though they contain digits', () => {
    // tiles: ['10', '+', '5', '=', '15'] — '10' and '15' are heavy two-digit
    const tiles = ['10', '+', '5', '=', '15'];
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 5, onRack: 0 } };  // very greedy
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    // Only index 2 (the literal '5') is a light digit; heavy '10'/'15' excluded
    expect(out.slotProbs[2]).toBe(2);
    expect(out.slotProbs[0]).not.toBe(2);   // '10' (heavy) NOT pinned
    expect(out.slotProbs[4]).not.toBe(2);   // '15' (heavy) NOT pinned
  });

  it('clamps locked + onRack to candidate count (over-spec degrades gracefully)', () => {
    const tiles = ['1', '+', '2', '=', '3'];  // 3 light digits
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 10, onRack: 10 } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    // lockN clamps to 3, rackN clamps to 0 (lockN ate all)
    const lockCount = [out.slotProbs[0], out.slotProbs[2], out.slotProbs[4]].filter(v => v === 2).length;
    expect(lockCount).toBe(3);
  });

  it('per-digit spec takes priority over __normal__ on overlapping positions', () => {
    // 4 light digits.  per-digit pins '5' lock=1, __normal__ wants lock=3 rack=0.
    // Expected: the single '5' goes to lock (per-digit), then __normal__ picks
    // 3 of the remaining 3 light digits → lock. So 4 locks total.
    const tiles = ['1', '5', '+', '2', '=', '3'];
    const p = makePlacement(tiles.length);
    const spec = {
      '5':         { locked: 1, onRack: 0 },          // pin the one '5' to lock
      '__normal__': { locked: 3, onRack: 0 },         // lock 3 more normals
    };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    // Light positions: 0,1,3,5 → 4 total.  3 of 4 get locked via __normal__,
    // plus the '5' at index 1 via per-digit → all 4 light positions locked.
    expect(out.slotProbs[0]).toBe(2);
    expect(out.slotProbs[1]).toBe(2);  // '5' via per-digit
    expect(out.slotProbs[3]).toBe(2);
    expect(out.slotProbs[5]).toBe(2);
  });

  it('zero locked + zero onRack: no-op (everything stays free)', () => {
    const tiles = ['1', '+', '2', '=', '3'];
    const p = makePlacement(tiles.length);
    const origSlotProbs = [...p.slotProbs];
    const spec = { '__normal__': { locked: 0, onRack: 0 } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    out.slotProbs.forEach((v, i) => {
      expect(v).toBeCloseTo(origSlotProbs[i]);
    });
  });

  it('digit "0" is treated as a light digit (eligible for locking)', () => {
    // equation 5+5=10 → tiles: ['5','+','5','=','1','0']
    // The standalone '0' is a light digit; '10','11',… are heavy two-digit
    // tiles.  We can't ask for lock=4 of the 4 light positions here
    // because indices 4 ('1') and 5 ('0') are adjacent — selectLockPositions
    // would prune one anyway.  Verify the loose intent instead: across
    // many runs with lock=1, the '0' at index 5 lands in the lock at
    // least once, proving it's in the candidate pool.
    const tiles = ['5', '+', '5', '=', '1', '0'];
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 1, onRack: 0 } };
    let zeroEverLocked = false;
    for (let i = 0; i < 60; i++) {
      const out = applyTileAssignmentToPlacement(tiles, p, spec);
      if (out.slotProbs[5] === 2) { zeroEverLocked = true; break; }
    }
    expect(zeroEverLocked).toBe(true);
    // Also: a one-shot run must pin exactly one light, never an operator.
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    const lockedIdx = out.slotProbs.findIndex(v => v === 2);
    expect(lockedIdx).toBeGreaterThanOrEqual(0);
    expect(_isLightDigit(tiles[lockedIdx])).toBe(true);
  });

  it('only onRack specified: pins onRack light digits to rack, rest free', () => {
    const tiles = ['1', '+', '2', '+', '3', '=', '6'];
    const p = makePlacement(tiles.length);
    const origProb = 1 / tiles.length;
    const spec = { '__normal__': { locked: 0, onRack: 2 } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    const lightIdx = [0, 2, 4, 6];
    const probs = lightIdx.map(i => out.slotProbs[i]);
    expect(probs.filter(v => v === 0).length).toBe(2);  // 2 forced rack
    expect(probs.filter(v => v === 2).length).toBe(0);  // 0 locked
    // The remaining 2 light digits should be untouched
    expect(probs.filter(v => v !== 0 && v !== 2).length).toBe(2);
    probs.filter(v => v !== 0 && v !== 2).forEach(v => {
      expect(v).toBeCloseTo(origProb);
    });
  });
});

describe('digitSpec — applyTileAssignmentToPlacement', () => {
  it('forces digit "5" to lock=1 when one of two "5" tiles is lock-flagged', () => {
    // equation 5+5=10 → tiles: ['5','+','5','=','1','0']
    const tiles = ['5', '+', '5', '=', '1', '0'];
    const p = makePlacement(tiles.length);
    const spec = { '5': { locked: 1, onRack: 1 } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);

    const fiveProbs = [out.slotProbs[0], out.slotProbs[2]].sort((a, b) => b - a);
    expect(fiveProbs[0]).toBe(2);  // one 5 forced lock
    expect(fiveProbs[1]).toBe(0);  // one 5 forced rack
  });

  it('forces all instances of digit "0" to rack when locked=0', () => {
    // equation 5+5=10 → two zero-bearing tiles are '1','0' (last two slots)
    const tiles = ['5', '+', '5', '=', '1', '0'];
    const p = makePlacement(tiles.length);
    const spec = { '0': { locked: 0, onRack: null } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[5]).toBe(0);  // the only '0' → rack
  });

  it('caps locked count to actual digit count in equation', () => {
    // tiles have ONE '3'; user asks for locked=4 → runtime should clamp to 1
    const tiles = ['3', '+', '4', '=', '7'];
    const p = makePlacement(tiles.length);
    const spec = { '3': { locked: 4, onRack: null } };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[0]).toBe(2);  // capped to the 1 available
  });

  it('digit spec coexists with operator + heavy specs', () => {
    // equation 12+3+5=20 → tiles: ['1','2','+','3','+','5','=','2','0']
    // ('12' and '20' are heavy two-digit tiles, but here we use them as
    // separate digit tiles so HEAVY_SET membership doesn't trigger.)
    const tiles = ['1', '2', '+', '3', '+', '5', '=', '2', '0'];
    const p = makePlacement(tiles.length);
    const spec = {
      '+': { locked: 1, onRack: 1 },   // 2 '+' → 1 lock / 1 rack
      '2': { locked: 0, onRack: null },// 2 '2' → all rack
    };
    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    // Both '2' tiles (indices 1 and 7) on rack
    expect(out.slotProbs[1]).toBe(0);
    expect(out.slotProbs[7]).toBe(0);
    // Plus-tile distribution: one lock, one rack across indices 2 and 4
    const plusProbs = [out.slotProbs[2], out.slotProbs[4]].sort((a, b) => b - a);
    expect(plusProbs[0]).toBe(2);
    expect(plusProbs[1]).toBe(0);
  });
});

// ─── 6. deepUpdate forward-compat + legacy-cfg defence ────────────────────
//
// Regression coverage for the runtime crash users hit when clicking the
// new Normal Tile / per-digit placement controls with an advancedCfg
// loaded from localStorage that was saved before those fields existed:
//
//   Uncaught TypeError: Cannot set properties of undefined
//                       (setting 'placementEnabled')
//   Uncaught TypeError: Cannot read properties of undefined (reading '…')
//
// Root cause: deepUpdate('normalTileCount.placementEnabled', true) walked
// `obj['normalTileCount']` which was undefined on the legacy cfg, then
// tried to set `.placementEnabled` on undefined.  countActive +
// buildGeneratorConfig had matching read-side hazards.

describe('deepUpdate — forward-compat on legacy cfgs', () => {
  it('auto-creates missing intermediate object when setting a fresh nested key', () => {
    const legacy = { foo: { bar: 1 } };  // no `normalTileCount` at all
    const next = deepUpdate(legacy, 'normalTileCount.placementEnabled', true);
    expect(next.normalTileCount).toEqual({ placementEnabled: true });
    expect(next.foo).toEqual({ bar: 1 });   // siblings untouched
    expect(legacy.normalTileCount).toBeUndefined();  // immutable: original not mutated
  });

  it('does not crash when path traverses multiple missing levels', () => {
    const legacy = {};
    const next = deepUpdate(legacy, 'digitSpec.5.enabled', true);
    expect(next.digitSpec).toEqual({ '5': { enabled: true } });
  });

  it('updates existing values without recreating the parent object', () => {
    const cfg = { heavyCount: { enabled: false, min: 0, max: 2 } };
    const next = deepUpdate(cfg, 'heavyCount.enabled', true);
    expect(next.heavyCount.enabled).toBe(true);
    expect(next.heavyCount.min).toBe(0);    // preserved
    expect(next.heavyCount.max).toBe(2);    // preserved
  });

  it('replaces a non-object intermediate with {} rather than silently failing', () => {
    // Defensive: a cfg accidentally serialised with `digitSpec = "stale"`
    // should still let the user toggle a digit on, not crash.
    const corrupt = { digitSpec: 'stale-string' };
    const next = deepUpdate(corrupt, 'digitSpec.5.enabled', true);
    expect(next.digitSpec).toEqual({ '5': { enabled: true } });
  });

  it('reproduces the original user-reported scenarios end-to-end', () => {
    // The exact toggle paths used by the Normal Tile and per-digit UI sections.
    const legacyCfg = {  // shape pre-PR-#1 + pre-PR-#2: no digitSpec, no normalTileCount
      algorithm: 'pattern',
      operatorCount: { enabled: false, min: 1, max: 3 },
      heavyCount: { enabled: false, min: 0, max: 2 },
      operatorSpec: {},
    };
    // Toggle Normal Tile placement — used to throw
    expect(() => deepUpdate(legacyCfg, 'normalTileCount.placementEnabled', true)).not.toThrow();
    // Toggle per-digit placement — used to throw
    expect(() => deepUpdate(legacyCfg, 'digitSpec.7.enabled', true)).not.toThrow();
    // Edit a lock count after toggle — also used to throw
    let cfg = deepUpdate(legacyCfg, 'normalTileCount.placementEnabled', true);
    cfg = deepUpdate(cfg, 'normalTileCount.locked', 2);
    expect(cfg.normalTileCount).toEqual({ placementEnabled: true, locked: 2 });
  });
});

describe('buildGeneratorConfig — accepts legacy/partial cfgs without crashing', () => {
  it('handles a cfg missing normalTileCount + digitSpec entirely', () => {
    const legacy = {
      algorithm: 'pattern',
      operatorCount: { enabled: false, min: 1, max: 3 },
      heavyCount:    { enabled: false, min: 0, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
      blankCount:    { enabled: false, min: 0, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
      equalCount:    { enabled: false, min: 1, max: 1, placementEnabled: false, locked: 0, onRack: 0 },
      operatorSpec:  {},
      // no digitSpec, no normalTileCount
    };
    expect(() => buildGeneratorConfig('cross', 9, legacy)).not.toThrow();
    const cfg = buildGeneratorConfig('cross', 9, legacy);
    expect(cfg.mode).toBe('cross');
    expect(cfg.totalTile).toBe(9);
    expect(cfg.tileAssignmentSpec).toBeUndefined();
  });

  it('handles a cfg missing operatorSpec entirely', () => {
    const legacy = {
      algorithm: 'pattern',
      operatorCount: { enabled: false, min: 1, max: 3 },
      heavyCount: { enabled: false, min: 0, max: 2 },
      // no operatorSpec
    };
    expect(() => buildGeneratorConfig('plain', 9, legacy)).not.toThrow();
  });

  it('handles cfg missing heavyCount/blankCount/equalCount (very legacy)', () => {
    const legacy = { algorithm: 'pattern', operatorSpec: {} };
    expect(() => buildGeneratorConfig('cross', 9, legacy)).not.toThrow();
    const cfg = buildGeneratorConfig('cross', 9, legacy);
    expect(cfg.heavyCount).toBeUndefined();
    expect(cfg.blankCount).toBeUndefined();
    expect(cfg.equalCount).toBeUndefined();
  });

  it('still respects an explicit empty {} cfg without throwing', () => {
    expect(() => buildGeneratorConfig('cross', 9, {})).not.toThrow();
  });

  it('round-trip: legacy cfg → deepUpdate toggle → buildGeneratorConfig works', () => {
    // The full user journey: load old cfg, toggle Normal Tile on,
    // generate.  Used to crash at step 2 before this fix.
    let cfg = {  // legacy
      operatorSpec: {},
    };
    cfg = deepUpdate(cfg, 'normalTileCount.placementEnabled', true);
    cfg = deepUpdate(cfg, 'normalTileCount.locked', 2);
    cfg = deepUpdate(cfg, 'normalTileCount.onRack', 1);
    const generatorCfg = buildGeneratorConfig('cross', 9, cfg);
    expect(generatorCfg.tileAssignmentSpec['__normal__']).toEqual({ locked: 2, onRack: 1 });
  });
});

// ─── 7. __normal__ adjacency + operator-shield regression ─────────────────
//
// User report: "When I set Normal Tile lock = max possible (e.g. lock=4
// for cross 12-tile), every problem SHOULD lock light digits — but
// sometimes an operator (+ - × ÷) ends up locked instead."
//
// Root cause: selectLockPositions enforces gap >= 2 between mustLock
// positions and PRUNES adjacent ones, then fills the shortfall from
// `eligible` — which includes operator positions.  If we naively pin
// two adjacent light-digit positions, one gets pruned and an operator
// slips into its lock slot.
//
// Fix layered into Phase 2 of applyTileAssignmentToPlacement:
//   (a) greedy non-adjacent picking with multi-shuffle retry
//   (b) when we can fully satisfy targetLockN, ZERO out non-light
//       slotProbs so selectLockPositions cannot pick them as fills
//   (c) when we cannot (degenerate equation with too few non-adjacent
//       lights), leave non-lights at default prob to preserve the
//       rack-size invariant — surfaces the issue without breaking the
//       cross-mode contract

const _isLightDigit = (tile) => /^[0-9]$/.test(tile) && !HEAVY_SET.has(tile);

describe('__normal__ — adjacency-aware lock selection', () => {
  it('never pins two adjacent light positions as mustLock', () => {
    // Heavily clustered light positions to force adjacency attempts.
    const tiles = ['1','1','+','2','2','+','3','3','+','5','=','7'];
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 4, onRack: 0 } };

    for (let i = 0; i < 50; i++) {
      const out = applyTileAssignmentToPlacement(tiles, p, spec);
      const pinnedLockIdx = out.slotProbs
        .map((v, idx) => v === 2 ? idx : -1)
        .filter(idx => idx >= 0);
      // Every pinned-lock position MUST be a light digit
      for (const idx of pinnedLockIdx) {
        expect(_isLightDigit(tiles[idx])).toBe(true);
      }
      // No two pinned positions are adjacent (gap >= 2)
      const sorted = [...pinnedLockIdx].sort((a, b) => a - b);
      for (let j = 1; j < sorted.length; j++) {
        expect(sorted[j] - sorted[j - 1]).toBeGreaterThan(1);
      }
    }
  });

  it('zeros operator/= slotProbs when targetLockN is fully satisfiable', () => {
    // 9-tile, lock=1 — fully satisfiable.  Fix path (b) triggers.
    const tiles = ['1','+','2','+','3','+','4','=','5'];
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 1, onRack: 0 } };

    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    expect(out.slotProbs[1]).toBe(0);  // '+'
    expect(out.slotProbs[3]).toBe(0);  // '+'
    expect(out.slotProbs[5]).toBe(0);  // '+'
    expect(out.slotProbs[7]).toBe(0);  // '='
    const lockCount = out.slotProbs.filter(v => v === 2).length;
    expect(lockCount).toBe(1);
  });

  it('preserves rack-size invariant in degenerate equations (NO operator-shield)', () => {
    // Contrived: ask for more lock than the equation can satisfy
    // non-adjacently.  Fix path (c): non-lights stay at default prob so
    // selectLockPositions can fill the shortfall (preserving the
    // board-locks = totalTile - 8 contract in cross mode).
    const tiles = ['1','2','3','4','+','5','=','6','7'];
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 5, onRack: 0 } };

    const out = applyTileAssignmentToPlacement(tiles, p, spec);
    const lockCount = out.slotProbs.filter(v => v === 2).length;
    expect(lockCount).toBeGreaterThan(0);
    expect(lockCount).toBeLessThanOrEqual(5);
    // No two pinned-locks are adjacent
    const pinnedLockIdx = out.slotProbs
      .map((v, idx) => v === 2 ? idx : -1)
      .filter(idx => idx >= 0);
    const sorted = [...pinnedLockIdx].sort((a, b) => a - b);
    for (let j = 1; j < sorted.length; j++) {
      expect(sorted[j] - sorted[j - 1]).toBeGreaterThan(1);
    }
    // And every pinned lock is a light digit
    for (const idx of pinnedLockIdx) {
      expect(_isLightDigit(tiles[idx])).toBe(true);
    }
  });

  it('lock=1 always pins a single light, never an operator (9-tile case)', () => {
    const tiles = ['1','+','2','+','3','+','4','=','5'];
    const p = makePlacement(tiles.length);
    const spec = { '__normal__': { locked: 1, onRack: 0 } };
    for (let i = 0; i < 30; i++) {
      const out = applyTileAssignmentToPlacement(tiles, p, spec);
      const lockedIdx = out.slotProbs.findIndex(v => v === 2);
      expect(lockedIdx).toBeGreaterThanOrEqual(0);
      expect(_isLightDigit(tiles[lockedIdx])).toBe(true);
    }
  });

  it('per-digit overrides win and __normal__ fills the rest non-adjacently', () => {
    const tiles = ['1','+','2','+','5','+','5','=','9'];
    const p = makePlacement(tiles.length);
    const spec = {
      '5':          { locked: 1, onRack: 0 },   // pin one '5' (slots 4 & 6 are '5')
      '__normal__': { locked: 2, onRack: 0 },   // plus 2 more lights, non-adjacent
    };
    for (let i = 0; i < 20; i++) {
      const out = applyTileAssignmentToPlacement(tiles, p, spec);
      const pinnedLockIdx = out.slotProbs
        .map((v, idx) => v === 2 ? idx : -1)
        .filter(idx => idx >= 0);
      for (const idx of pinnedLockIdx) {
        expect(_isLightDigit(tiles[idx])).toBe(true);
      }
      const sorted = [...pinnedLockIdx].sort((a, b) => a - b);
      for (let j = 1; j < sorted.length; j++) {
        expect(sorted[j] - sorted[j - 1]).toBeGreaterThan(1);
      }
    }
  });
});
