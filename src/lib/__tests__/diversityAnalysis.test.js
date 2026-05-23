import { describe, expect, it } from 'vitest';
import {
  analyzeGeneratedPuzzles,
  deriveAllowedOperatorsFromConfigs,
  equationToDiversityPattern,
  selectBalancedPatternBatch,
  summarizeOperatorBalance,
} from '../diversityAnalysis.js';

function result(equation, solutionTiles = null) {
  return {
    equation,
    eqCount: (equation.match(/=/g) || []).length,
    solutionTiles: solutionTiles ?? equation.match(/\d+|[+×÷=-]/g),
  };
}

describe('equationToDiversityPattern', () => {
  it('collapses numbers while preserving operator/equal shape', () => {
    expect(equationToDiversityPattern('12÷3=4')).toBe('O÷O=O');
    expect(equationToDiversityPattern('1+2=0+3=3')).toBe('O+O=O+O=O');
    expect(equationToDiversityPattern('9-1-1=7')).toBe('O-O-O=O');
  });
});

describe('summarizeOperatorBalance', () => {
  it('scores balanced allowed operators higher than biased operators', () => {
    const balanced = summarizeOperatorBalance({ '+': 10, '-': 10, '×': 10, '÷': 0 }, ['+', '-', '×']);
    const biased = summarizeOperatorBalance({ '+': 28, '-': 2, '×': 0, '÷': 0 }, ['+', '-', '×']);

    expect(balanced.score).toBeGreaterThan(0.95);
    expect(biased.score).toBeLessThan(0.25);
    expect(balanced.operators).toEqual(['+', '-', '×']);
  });
});

describe('deriveAllowedOperatorsFromConfigs', () => {
  it('excludes explicitly zeroed operators from the analysis baseline', () => {
    const allowed = deriveAllowedOperatorsFromConfigs([
      {
        operatorSpec: {
          '+': [0, 4],
          '-': [0, 4],
          '×': [0, 4],
          '÷': [0, 0],
        },
      },
    ]);

    expect(allowed).toEqual(['+', '-', '×']);
  });

  it('treats a partial spec as a requirement, not a full allowlist', () => {
    const allowed = deriveAllowedOperatorsFromConfigs([
      { operatorSpec: { '÷': [1, 1] }, operatorCount: [3, 3] },
    ]);

    expect(allowed).toEqual(['+', '-', '×', '÷']);
  });
});

describe('selectBalancedPatternBatch', () => {
  it('selects requested patterns with balanced allowed operator totals and no disallowed division', () => {
    const candidates = [
      'O+O=O', 'O+O+O=O', 'O+O=O+O', 'O+O+O=O+O',
      'O-O=O', 'O-O-O=O', 'O-O=O-O', 'O-O-O=O-O',
      'O×O=O', 'O×O×O=O', 'O×O=O×O', 'O×O×O=O×O',
      'O÷O=O', 'O÷O÷O=O',
    ];

    const plan = selectBalancedPatternBatch(candidates, 9, { allowedOperators: ['+', '-', '×'] });

    expect(plan.selected).toHaveLength(9);
    expect(plan.selected.some(item => item.pattern.includes('÷'))).toBe(false);
    expect(plan.operatorBalance.score).toBeGreaterThan(0.85);
    expect(Math.max(
      plan.operatorTotals['+'],
      plan.operatorTotals['-'],
      plan.operatorTotals['×'],
    ) - Math.min(
      plan.operatorTotals['+'],
      plan.operatorTotals['-'],
      plan.operatorTotals['×'],
    )).toBeLessThanOrEqual(1);
  });
});

describe('analyzeGeneratedPuzzles', () => {
  it('reports pattern coverage, entropy, operator balance, and repeat-number risk', () => {
    const stats = analyzeGeneratedPuzzles([
      result('1+2=3'),
      result('4-1=3'),
      result('2×3=6'),
      result('1+1+1+1=4'),
      result('2×3=5+1=6'),
    ], {
      requestedCount: 10,
      possiblePatternCount: 1000,
      allowedOperators: ['+', '-', '×'],
      elapsedMs: 25,
    });

    expect(stats.success).toBe(5);
    expect(stats.requestedCount).toBe(10);
    expect(stats.possibleCoverage).toBeCloseTo(stats.uniquePatternCount / 1000);
    expect(stats.sampleCoverage).toBeGreaterThan(0.4);
    expect(stats.normalizedPatternEntropy).toBeGreaterThan(0.8);
    expect(stats.operatorBalance.operators).toEqual(['+', '-', '×']);
    expect(stats.repeatRisk.excessivePuzzles).toBe(1);
    expect(stats.warningExamples[0].equation).toBe('1+1+1+1=4');
    expect(stats.score).toBeGreaterThan(0);
    expect(stats.score).toBeLessThanOrEqual(1);
  });

  it('separates operator mix diversity from raw pattern uniqueness', () => {
    const stats = analyzeGeneratedPuzzles([
      result('1+2=3'),
      result('4+5=9'),
      result('9-2=7'),
      result('2×3=6'),
    ], { allowedOperators: ['+', '-', '×'] });

    expect(stats.uniquePatternCount).toBe(3);
    expect(stats.operatorMixEntries.map(([mix]) => mix)).toContain('+1 -0 ×0');
    expect(stats.operatorMixEntries.map(([mix]) => mix)).toContain('+0 -1 ×0');
    expect(stats.operatorMixEntries.map(([mix]) => mix)).toContain('+0 -0 ×1');
  });
});

