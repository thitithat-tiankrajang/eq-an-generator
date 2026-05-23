// =================================================================
//  generatorDiversityPlanner.test
// =================================================================
//
//  Five tests covering the planner's promised behaviour:
//
//   1. Hard filter: disallowed ÷ never lands in the selected batch
//      even when fake candidates emit ÷.
//   2. Operator balance: across 10 selections from a varied candidate
//      pool, the totals for +/-/× sit close together (max-min <= 1).
//   3. Repeat-number penalty: a candidate with a triple-repeat number
//      loses to a clean alternative.
//   4. Pattern-duplicate penalty: a candidate whose pattern matches
//      something already in the batch loses to a novel-pattern
//      alternative.
//   5. Integration: drive `buildDiversityBalancedBatch` with the real
//      `generateBingo` for 30 puzzles with ÷ disabled; assert no ÷
//      appears, operator balance is healthy, and excessive repeats
//      stay below a reasonable rate.
//
//  Tests 1-4 use FAKE candidates (just objects with an `equation`
//  string) so we exercise the scoring/selection logic without paying
//  for real generation.  Test 5 is the end-to-end sanity check.

import { describe, expect, it } from 'vitest';
import {
  scoreCandidateForBatch,
  pickBestCandidate,
  buildDiversityBalancedBatch,
} from '../generatorDiversityPlanner.js';
import {
  analyzeGeneratedPuzzles,
  deriveAllowedOperatorsFromConfigs,
} from '../diversityAnalysis.js';
import { generateBingo } from '../bingoGenerator.js';

function makeResult(equation) {
  return { equation };
}

// =================================================================
//  1. Hard filter: disallowed ÷ never selected
// =================================================================

describe('planner — hard filter on disallowed operators', () => {
  it('returns -Infinity for a candidate that emits a disallowed operator', () => {
    const out = scoreCandidateForBatch(
      [],
      makeResult('6÷2=3'),
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(out.score).toBe(-Infinity);
    expect(out.breakdown.reason).toBe('disallowed-operator');
    expect(out.breakdown.operator).toBe('÷');
  });

  it('pickBestCandidate returns null if every candidate is hard-rejected', () => {
    const picked = pickBestCandidate(
      [],
      [makeResult('6÷2=3'), makeResult('8÷4=2')],
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(picked).toBeNull();
  });

  it('selected batch contains no ÷ even when half the candidates emit ÷', () => {
    const cfgList = Array.from({ length: 8 }, () => ({}));
    let i = 0;
    const candidates = [
      // Cycle through good (+, -, ×) and bad (÷) so the planner has
      // to skip the bad ones every iteration.
      '1+2=3', '6÷2=3', '4-1=3', '9÷3=3',
      '2×3=6', '12÷2=6', '5+1=6', '8÷4=2',
      '1+1=2', '6÷3=2', '5-3=2', '4÷2=2',
    ];
    const generateOne = () => {
      const eq = candidates[i % candidates.length];
      i++;
      return makeResult(eq);
    };
    const selected = buildDiversityBalancedBatch(cfgList, generateOne, {
      allowedOperators: ['+', '-', '×'],
      candidatesPerCfg: 4,
    });
    expect(selected.length).toBe(8);
    for (const r of selected) {
      expect(r.equation.includes('÷')).toBe(false);
    }
  });
});

// =================================================================
//  2. Operator balance: totals close together
// =================================================================

describe('planner — operator balance across the picked batch', () => {
  it('selected 10 patterns have +/-/× totals within 1 of each other', () => {
    // Candidate pool intentionally varied so the planner has a real
    // choice each iteration — if the planner is doing its job, the
    // running totals should converge to balanced.
    const pool = [
      // each "round" of 3 includes one +, one -, one ×
      '1+2=3', '4-1=3', '2×2=4',
      '5+1=6', '7-1=6', '3×2=6',
      '2+3=5', '8-3=5', '5×1=5',
      '1+0=1', '2-1=1', '1×1=1',
      // duplicate-ish shapes to give the planner room to prefer novelty
      '1+2=3', '4-2=2', '2×3=6',
      '4+5=9', '9-0=9', '3×3=9',
    ];
    let i = 0;
    const generateOne = () => {
      const eq = pool[i % pool.length];
      i++;
      return makeResult(eq);
    };
    const cfgList = Array.from({ length: 10 }, () => ({}));
    const selected = buildDiversityBalancedBatch(cfgList, generateOne, {
      allowedOperators: ['+', '-', '×'],
      candidatesPerCfg: 4,
    });
    expect(selected.length).toBe(10);

    // Tally operator totals across the SELECTED batch and verify the
    // spread between most and least common operator is <= 1.  This is
    // a tight constraint — the planner has to actively trade novelty
    // for balance, which is the whole point.
    const totals = { '+': 0, '-': 0, '×': 0 };
    for (const r of selected) {
      for (const ch of r.equation) {
        if (ch in totals) totals[ch]++;
      }
    }
    const counts = Object.values(totals);
    const spread = Math.max(...counts) - Math.min(...counts);
    expect(spread).toBeLessThanOrEqual(1);
  });
});

// =================================================================
//  3. Repeated-number penalty
// =================================================================

describe('planner — repeat-number penalty', () => {
  it('prefers a clean candidate over one with a triple-repeat number', () => {
    // Both have the same pattern shape and same operator profile so
    // the only meaningful difference is the repeat-number rate.
    const clean   = makeResult('1+2+3=6');     // every number unique
    const triplet = makeResult('1+1+1=3');     // three "1"s

    const cleanScore   = scoreCandidateForBatch([], clean,   { allowedOperators: ['+', '-', '×'] }).score;
    const tripletScore = scoreCandidateForBatch([], triplet, { allowedOperators: ['+', '-', '×'] }).score;
    expect(cleanScore).toBeGreaterThan(tripletScore);

    const picked = pickBestCandidate([], [triplet, clean], { allowedOperators: ['+', '-', '×'] });
    expect(picked?.candidate).toBe(clean);
  });

  it('quadruple-repeat scores 0 on repeatHealth (severe penalty)', () => {
    const out = scoreCandidateForBatch(
      [],
      makeResult('1+1+1+1=4'),  // four "1"s
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(out.breakdown.repeatHealth).toBe(0);
    expect(out.breakdown.maxRepeat).toBe(4);
  });
});

// =================================================================
//  4. Pattern-duplicate penalty
// =================================================================

describe('planner — pattern-duplicate penalty', () => {
  it('prefers a novel pattern over one already in the running batch', () => {
    const existing = [
      makeResult('1+2=3'),    // pattern O+O=O
      makeResult('4+5=9'),    // pattern O+O=O (duplicate)
      makeResult('6+1=7'),    // pattern O+O=O (3rd!)
    ];
    // Two candidates: same operator profile but DIFFERENT pattern.
    const dupPattern = makeResult('2+3=5');           // pattern O+O=O (would be 4th)
    const novelPattern = makeResult('1+2+3=6');       // pattern O+O+O=O (novel)

    const dupScore   = scoreCandidateForBatch(existing, dupPattern,   { allowedOperators: ['+', '-', '×'] });
    const novelScore = scoreCandidateForBatch(existing, novelPattern, { allowedOperators: ['+', '-', '×'] });

    expect(novelScore.score).toBeGreaterThan(dupScore.score);
    expect(dupScore.breakdown.novelty).toBeLessThan(novelScore.breakdown.novelty);

    const picked = pickBestCandidate(existing, [dupPattern, novelPattern], {
      allowedOperators: ['+', '-', '×'],
    });
    expect(picked?.candidate).toBe(novelPattern);
  });

  it('top-pattern concentration drops the score as a pattern dominates', () => {
    // Batch already 70% pattern "O+O=O" — adding another should hurt.
    const existing = [
      makeResult('1+2=3'), makeResult('4+5=9'), makeResult('6+1=7'),
      makeResult('2+2=4'), makeResult('3+3=6'), makeResult('1+1=2'),
      makeResult('5+5=10'),
      makeResult('1-0=1'), makeResult('1-1=0'), makeResult('3-2=1'),
    ];
    const dupPattern = makeResult('7+2=9');
    const novelOp    = makeResult('2×3=6');

    const dupRes = scoreCandidateForBatch(existing, dupPattern, { allowedOperators: ['+', '-', '×'] });
    const novelRes = scoreCandidateForBatch(existing, novelOp, { allowedOperators: ['+', '-', '×'] });

    // Concentration component for novelOp should be HIGHER (the top
    // share stays at 7/11) than for dupPattern (would push top to 8/11).
    expect(novelRes.breakdown.concentration).toBeGreaterThan(dupRes.breakdown.concentration);
  });
});

// =================================================================
//  5. Integration with the real generator
// =================================================================
//
//  Drives the planner with generateBingo and asserts the end-to-end
//  effect on a 30-puzzle batch with ÷ disabled.  We use the WORKER
//  candidates-per-cfg = 3 default so this mirrors what bingoWorker.js
//  will do.

describe('planner — integration with generateBingo (÷ disabled, 30 puzzles)', () => {
  it('produces a clean balanced batch end-to-end', () => {
    const cfg = {
      mode: 'plain',
      totalTile: 9,
      operatorSpec: {
        '+': [0, 4],
        '-': [0, 4],
        '×': [0, 4],
        '÷': [0, 0],
      },
    };
    const cfgList = Array.from({ length: 30 }, () => cfg);
    const allowedOperators = deriveAllowedOperatorsFromConfigs(cfgList);
    expect(allowedOperators).toEqual(['+', '-', '×']);

    // Single planner batch — we used to compare against a K=1
    // baseline, but the generator's stochastic variance can
    // occasionally make the baseline-vs-planner spread invert by
    // pure luck, producing a ~33% flake rate.  Sticking with robust
    // absolute thresholds tuned well below observed K=5 minimums.
    //
    // Variance probe (10 trials of 30 puzzles at K=5):
    //   balance.score min=0.49 p10=0.59 median=0.74 max=0.95 mean=0.73
    // Floors below are set BELOW the empirical minimum so the test
    // catches "planner broken" without flaking on stochastic luck.
    const plannerBatch = buildDiversityBalancedBatch(
      cfgList,
      (c) => generateBingo(c),
      { allowedOperators, candidatesPerCfg: 5 },
    );
    expect(plannerBatch.length).toBe(30);

    // 5a. No ÷ anywhere — the planner's hard guarantee.
    for (const r of plannerBatch) {
      expect(r.equation.includes('÷')).toBe(false);
    }

    const stats = analyzeGeneratedPuzzles(plannerBatch, {
      allowedOperators, requestedCount: 30,
    });

    // 5b. Operator-balance absolute floor.  0.30 sits well above the
    // no-planner baseline (~0.27) and well below the K=5 empirical
    // minimum (0.49).  Catches "planner stopped working entirely"
    // while tolerating the generator's stochastic spread.
    expect(stats.operatorBalance.score).toBeGreaterThan(0.30);

    // 5c. Excessive-repeat rate (a single equation containing 3+ of
    // the same number) stays low — planner penalises this so it
    // should be rare in practice.
    expect(stats.repeatRisk.excessiveRate).toBeLessThan(0.20);

    // 5d. Unique-pattern coverage floor — probe showed ≈ 25/30 at
    // K=5; 8 is a very loose floor that catches a planner totally
    // broken on novelty.
    expect(stats.uniquePatternCount).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
