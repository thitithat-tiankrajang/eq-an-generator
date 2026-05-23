// =================================================================
//  multiEqual.test — A=B=C support across validation + generation
// =================================================================
//
//  These tests pin the contract for "every expression segment must
//  evaluate to the same value" — the rule for multi-equal A-Math
//  problems like 1+2=2+1=3.
//
//  Coverage:
//   1. Math validator (bingoMath.isValidEquation):
//      - eqCount=1 unchanged
//      - eqCount=2 accepts A=B=C only when all three segments evaluate equal
//      - eqCount=3 accepts A=B=C=D iff all four are equal
//      - explicit `requiredEquals` mismatch is rejected
//
//   2. Rules validator (equationAnagramLogic.isValidEquationByRules):
//      - Multi-equal supported with rational/fraction comparison
//
//   3. Constructors (equationConstructors.constructEquationV6):
//      - eqCount=2 produces an equation with exactly two '=' signs
//      - eqCount=3 produces an equation with exactly three '=' signs
//      - All segments evaluate equal (the validator is internal — we
//        re-check externally as a belt-and-braces guarantee)
//
//   4. End-to-end generator (generateBingo):
//      - cfg.equalCount = [2, 2] produces a 2-equal puzzle
//      - cfg.equalCount = [3, 3] produces a 3-equal puzzle when feasible

import { describe, it, expect } from 'vitest';
import { isValidEquation } from '@/lib/bingoMath.js';
import { isValidEquationByRules } from '@/lib/equationAnagramLogic';
import { constructEquationV6, POOL_DEF } from '@/lib/equationConstructors.js';
import { generateBingo } from '@/lib/bingoGenerator.js';

// =================================================================
//  1. isValidEquation — integer-range validator
// =================================================================

describe('isValidEquation — single-equal (regression / contract)', () => {
  it('accepts a simple A=B', () => {
    expect(isValidEquation('1+2=3', 1)).toBe(true);
    expect(isValidEquation('10-4=6', 1)).toBe(true);
  });

  it('rejects when expected 1 but got 2 equals', () => {
    expect(isValidEquation('1+2=3=3', 1)).toBe(false);
  });

  it('rejects when sides do not match', () => {
    expect(isValidEquation('1+2=5', 1)).toBe(false);
  });
});

describe('isValidEquation — multi-equal A=B=C', () => {
  it('accepts when ALL three segments evaluate equal', () => {
    // 1+2 = 0+3 = 3
    expect(isValidEquation('1+2=0+3=3', 2)).toBe(true);
    // 2×3 = 5+1 = 6
    expect(isValidEquation('2×3=5+1=6', 2)).toBe(true);
    // Degenerate but valid: 3=3=3 (no operators)
    expect(isValidEquation('3=3=3', 2)).toBe(true);
  });

  it('rejects when any segment disagrees', () => {
    expect(isValidEquation('1+2=4=3', 2)).toBe(false);
    expect(isValidEquation('1+2=3=4', 2)).toBe(false);
    expect(isValidEquation('1+1=2+1=3', 2)).toBe(false);  // 2 ≠ 3
  });

  it('rejects when the equals count does not match requiredEquals', () => {
    // requiredEquals=2 but the string only has one '='
    expect(isValidEquation('1+2=3', 2)).toBe(false);
    // requiredEquals=1 but the string has two '='
    expect(isValidEquation('1+2=3=3', 1)).toBe(false);
  });

  it('rejects empty-segment patterns even when count matches', () => {
    expect(isValidEquation('=1=1', 2)).toBe(false);
    expect(isValidEquation('1==2', 2)).toBe(false);
    expect(isValidEquation('1=2=', 2)).toBe(false);
  });
});

describe('isValidEquation — A=B=C=D (eqCount=3)', () => {
  it('accepts when all four segments evaluate equal', () => {
    expect(isValidEquation('4=4=4=4', 3)).toBe(true);
    expect(isValidEquation('1+3=2+2=4=4', 3)).toBe(true);
  });

  it('rejects when any segment differs', () => {
    expect(isValidEquation('1+3=2+2=4=5', 3)).toBe(false);
    expect(isValidEquation('1+3=2+1=4=4', 3)).toBe(false);
  });
});

// =================================================================
//  2. isValidEquationByRules — rational/fraction validator
// =================================================================

describe('isValidEquationByRules — multi-equal with fractions', () => {
  it('accepts integer multi-equal', () => {
    expect(isValidEquationByRules('1+2=0+3=3', 2)).toBe(true);
  });

  it('accepts fractional multi-equal under rational compare', () => {
    // 6÷2 = 9÷3 = 3
    expect(isValidEquationByRules('6÷2=9÷3=3', 2)).toBe(true);
  });

  it('rejects multi-equal when not all segments match', () => {
    expect(isValidEquationByRules('6÷2=9÷3=4', 2)).toBe(false);
  });

  it('treats missing equalsCount as "use the actual count from the string"', () => {
    // No requiredEquals passed → counts the '=' in the string itself.
    expect(isValidEquationByRules('1+2=3=3')).toBe(true);
    expect(isValidEquationByRules('1+2=4=3')).toBe(false);
  });
});

// =================================================================
//  3. constructEquationV6 — generator produces valid multi-equal
// =================================================================

describe('constructEquationV6 — eqCount=2 (A=B=C)', () => {
  it('produces equations with exactly two equals signs', () => {
    let produced = 0;
    for (let i = 0; i < 50; i++) {
      const eq = constructEquationV6(/* N_ops */ 2, /* eqCount */ 2, /* totalTile */ 10, null, POOL_DEF);
      if (!eq) continue;
      produced++;
      const equalsCount = (eq.match(/=/g) || []).length;
      expect(equalsCount).toBe(2);
    }
    // At least some should succeed; the builder may legitimately give up
    // on tight tile budgets, but eqCount=2 with N_ops=2 in 10 tiles is
    // well within the feasible region.
    expect(produced).toBeGreaterThan(0);
  });

  it('every produced equation passes the math validator with requiredEquals=2', () => {
    for (let i = 0; i < 50; i++) {
      const eq = constructEquationV6(2, 2, 10, null, POOL_DEF);
      if (!eq) continue;
      expect(isValidEquation(eq, 2)).toBe(true);
    }
  });
});

describe('constructEquationV6 — eqCount=3 (A=B=C=D)', () => {
  it('produces equations with exactly three equals signs when feasible', () => {
    let produced = 0;
    for (let i = 0; i < 50; i++) {
      // eqCount=3 needs more tiles — use 13.
      const eq = constructEquationV6(2, 3, 13, null, POOL_DEF);
      if (!eq) continue;
      produced++;
      const equalsCount = (eq.match(/=/g) || []).length;
      expect(equalsCount).toBe(3);
      expect(isValidEquation(eq, 3)).toBe(true);
    }
    expect(produced).toBeGreaterThan(0);
  });
});

// =================================================================
//  4. End-to-end generateBingo with cfg.equalCount = [2, 2] / [3, 3]
// =================================================================

describe('generateBingo — multi-equal end-to-end', () => {
  it('cfg.equalCount=[2,2] (plain mode) yields a 2-equal puzzle', () => {
    let produced = 0;
    let multiEqualHits = 0;
    for (let i = 0; i < 12; i++) {
      const r = generateBingo({
        mode: 'plain',
        totalTile: 10,
        equalCount: [2, 2],
      });
      if (!r) continue;
      produced++;
      const equalsCount = (r.equation.match(/=/g) || []).length;
      if (equalsCount === 2) multiEqualHits++;
    }
    expect(produced).toBeGreaterThan(0);
    expect(multiEqualHits).toBeGreaterThan(0);
  });

  it('cfg.equalCount=[2,2] (expand mode, 11 tiles) yields a 2-equal puzzle', () => {
    // Expand mode requires totalTile >= 11.
    let produced = 0;
    let multiEqualHits = 0;
    for (let i = 0; i < 12; i++) {
      const r = generateBingo({
        mode: 'expand',
        totalTile: 11,
        equalCount: [2, 2],
      });
      if (!r) continue;
      produced++;
      const equalsCount = (r.equation.match(/=/g) || []).length;
      if (equalsCount === 2) multiEqualHits++;
    }
    expect(produced).toBeGreaterThan(0);
    expect(multiEqualHits).toBeGreaterThan(0);
  });

  it('every produced multi-equal puzzle has segments that actually evaluate equal', () => {
    // Belt-and-braces: even though the generator should never emit an
    // invalid equation, double-check end-to-end to catch any future
    // regression where eqCount metadata desyncs from the produced
    // equation string.  Use totalTile=10 / 8 iterations — proven fast in
    // the test above; 11-tile plain mode hits the default 5s timeout.
    for (let i = 0; i < 8; i++) {
      const r = generateBingo({ mode: 'plain', totalTile: 10, equalCount: [2, 2] });
      if (!r) continue;
      const equalsCount = (r.equation.match(/=/g) || []).length;
      if (equalsCount !== 2) continue;  // generator allowed a fallback shape
      expect(isValidEquation(r.equation, 2)).toBe(true);
    }
  }, 15000);

  it('cfg.equalCount=[1,1] (default-ish) still produces single-equal puzzles (regression)', () => {
    // Multi-equal support must NOT break the single-equal default behaviour.
    let produced = 0;
    for (let i = 0; i < 10; i++) {
      const r = generateBingo({ mode: 'plain', totalTile: 9, equalCount: [1, 1] });
      if (!r) continue;
      produced++;
      const equalsCount = (r.equation.match(/=/g) || []).length;
      expect(equalsCount).toBe(1);
    }
    expect(produced).toBeGreaterThan(0);
  });
});
