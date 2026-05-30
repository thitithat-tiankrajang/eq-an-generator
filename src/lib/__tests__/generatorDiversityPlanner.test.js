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
  pickLeastRepetitiveCandidate,
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

  it('triple-repeat is scored (not rejected) with repeatHealth 0.30', () => {
    // A triple is a SOFT signal under the default cap (4): penalised via
    // repeatHealth and demoted by tiered selection, but still scoreable so
    // a hard config can fall back to it rather than producing nothing.
    const out = scoreCandidateForBatch(
      [],
      makeResult('1+1+1=3'),    // three "1"s
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(out.score).toBeGreaterThan(-Infinity);
    expect(out.breakdown.repeatHealth).toBeCloseTo(0.30, 5);
    expect(out.breakdown.maxRepeat).toBe(3);
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

// =================================================================
//  6. Repeated-number HARD CAP (the explicit เลขซ้ำ fix)
// =================================================================

describe('planner — repeat-number hard cap', () => {
  it('hard-rejects a quadruple-flooded equation (default cap 4)', () => {
    const out = scoreCandidateForBatch(
      [],
      makeResult('1+1+1+1=4'),  // four "1"s → maxRepeat 4
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(out.score).toBe(-Infinity);
    expect(out.breakdown.reason).toBe('repeat-number-cap');
    expect(out.breakdown.maxRepeat).toBe(4);
    expect(out.breakdown.cap).toBe(4);
  });

  it('cap is configurable — repeatHardCap:3 rejects a triple the default keeps', () => {
    const triple = scoreCandidateForBatch(
      [], makeResult('1+1+1=3'),
      { allowedOperators: ['+', '-', '×'], repeatHardCap: 3 },
    );
    expect(triple.score).toBe(-Infinity);
    expect(triple.breakdown.reason).toBe('repeat-number-cap');

    // Same triple is accepted under the default cap (4).
    const def = scoreCandidateForBatch(
      [], makeResult('1+1+1=3'),
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(def.score).toBeGreaterThan(-Infinity);
  });

  it('pickBestCandidate returns null when every candidate floods the cap', () => {
    const picked = pickBestCandidate(
      [],
      [makeResult('1+1+1+1=4'), makeResult('2+2+2+2=8')],
      { allowedOperators: ['+', '-', '×'] },
    );
    expect(picked).toBeNull();
  });

  it('no flooded equation survives a batch even when half the candidates flood', () => {
    const cfgList = Array.from({ length: 6 }, () => ({}));
    // Alternating flood / clean so each slot always has a clean option.
    const draws = [
      '1+1+1+1=4',  // flood (maxRepeat 4)
      '1+2+3=6',    // clean
      '2+2+2+2=8',  // flood
      '4+5=9',      // clean
      '3+3+3+3=12', // flood
      '7+1=8',      // clean
    ];
    let i = 0;
    const generateOne = () => makeResult(draws[i++ % draws.length]);
    const selected = buildDiversityBalancedBatch(cfgList, generateOne, {
      allowedOperators: ['+', '-', '×'],
      candidatesPerCfg: 2,
    });
    expect(selected.length).toBe(6);
    for (const r of selected) {
      const counts = {};
      for (const tok of r.equation.match(/\d+/g) || []) counts[tok] = (counts[tok] || 0) + 1;
      const maxRepeat = Math.max(0, ...Object.values(counts));
      expect(maxRepeat).toBeLessThan(4);
    }
  });
});

// =================================================================
//  7. Tiered selection — clean numbers beat a higher-scoring triple
// =================================================================

describe('planner — clean tier overrides raw score', () => {
  it('prefers a clean candidate even when a triple scores higher on other axes', () => {
    // Force ALL weight onto novelty so the triple (a novel pattern) beats
    // the clean candidate (a duplicate pattern) on the raw weighted sum.
    const onlyNovelty = {
      novelty: 1, topConcentration: 0, operatorBalance: 0, repeatHealth: 0, numberSpread: 0,
    };
    const opts = { allowedOperators: ['+', '-', '×'], weights: onlyNovelty };

    const existing    = [makeResult('1+2=3')];  // pattern O+O=O seen once
    const cleanDup     = makeResult('4+5=9');    // pattern O+O=O (seen) — low novelty, maxRepeat 1
    const tripleNovel  = makeResult('2+2+2=6');  // pattern O+O+O=O (novel) — high novelty, maxRepeat 3

    const cleanScore  = scoreCandidateForBatch(existing, cleanDup, opts).score;
    const tripleScore = scoreCandidateForBatch(existing, tripleNovel, opts).score;
    // Raw score: the novel-pattern triple wins (all weight on novelty).
    expect(tripleScore).toBeGreaterThan(cleanScore);

    // But tiered selection picks the clean candidate anyway.
    const picked = pickBestCandidate(existing, [tripleNovel, cleanDup], opts);
    expect(picked?.candidate).toBe(cleanDup);
    expect(picked?.breakdown.maxRepeat).toBe(1);
  });

  it('prefers an all-distinct candidate over a pair (both within the soft cap)', () => {
    // Both candidates are "clean" under a binary cap; ascending tiering still
    // prefers the all-distinct one (tier 1) over the pair (tier 2), even when
    // the pair would win on the raw weighted score.
    const onlyNovelty = {
      novelty: 1, topConcentration: 0, operatorBalance: 0, repeatHealth: 0, numberSpread: 0,
    };
    const opts = { allowedOperators: ['+', '-', '×'], weights: onlyNovelty };

    const existing     = [makeResult('1+2+3=6')]; // pattern O+O+O=O seen once
    const distinctDup   = makeResult('4+5+6=15');  // distinct (tier 1), pattern seen → low novelty
    const pairNovel     = makeResult('7+7=14');    // a pair (tier 2), pattern O+O=O novel → high novelty

    const dScore = scoreCandidateForBatch(existing, distinctDup, opts).score;
    const pScore = scoreCandidateForBatch(existing, pairNovel, opts).score;
    expect(pScore).toBeGreaterThan(dScore); // raw score: the pair wins on novelty

    const picked = pickBestCandidate(existing, [pairNovel, distinctDup], opts);
    expect(picked?.candidate).toBe(distinctDup); // but tiering prefers all-distinct
    expect(picked?.breakdown.maxRepeat).toBe(1);
  });

  it('reaches past the soft cap only when no clean candidate exists', () => {
    // Both candidates are triples (maxRepeat 3) — none clean. The planner
    // must still return the better-scoring triple rather than null.
    const a = makeResult('1+1+1=3');
    const b = makeResult('2+2+2=6');
    const picked = pickBestCandidate([], [a, b], { allowedOperators: ['+', '-', '×'] });
    expect(picked).not.toBeNull();
    expect([a, b]).toContain(picked.candidate);
    expect(picked.breakdown.maxRepeat).toBe(3);
  });
});

// =================================================================
//  8. numberSpread — batch-level number-value variety
// =================================================================

describe('planner — numberSpread rewards fresh number values', () => {
  it('a candidate using over-used values scores lower on numberSpread', () => {
    // Batch where the value "5" is over-represented.
    const existing = [
      makeResult('5+1=6'), makeResult('5+2=7'),
      makeResult('5+3=8'), makeResult('5+4=9'),
    ];
    const opts = { allowedOperators: ['+', '-', '×'] };
    const reuse = scoreCandidateForBatch(existing, makeResult('5+5=10'), opts);
    const fresh = scoreCandidateForBatch(existing, makeResult('13+14=27'), opts);
    expect(fresh.breakdown.numberSpread).toBeGreaterThan(reuse.breakdown.numberSpread);
  });

  it('an empty batch gives a distinct candidate full numberSpread', () => {
    const opts = { allowedOperators: ['+', '-', '×'] };
    const distinct       = scoreCandidateForBatch([], makeResult('1+2=3'), opts);
    const internalRepeat = scoreCandidateForBatch([], makeResult('5+5=10'), opts);
    expect(distinct.breakdown.numberSpread).toBe(1);
    expect(internalRepeat.breakdown.numberSpread).toBeLessThan(1);
  });
});

// =================================================================
//  9. pickLeastRepetitiveCandidate — fallback helper
// =================================================================

describe('planner — pickLeastRepetitiveCandidate', () => {
  it('returns the candidate with the fewest intra-equation repeats', () => {
    const triple = makeResult('1+1+1=3');   // maxRepeat 3
    const pair   = makeResult('2+2=4');      // maxRepeat 2
    const clean  = makeResult('1+2+3=6');    // maxRepeat 1
    expect(pickLeastRepetitiveCandidate([triple, pair, clean])).toBe(clean);
    expect(pickLeastRepetitiveCandidate([triple, pair])).toBe(pair);
  });

  it('returns null for an empty or equation-less list', () => {
    expect(pickLeastRepetitiveCandidate([])).toBeNull();
    expect(pickLeastRepetitiveCandidate([{}, { foo: 1 }])).toBeNull();
  });
});

// =================================================================
//  10. Integration — repeated-number guarantees end-to-end
// =================================================================
//
//  Same plain-9-tile / ÷-disabled config as test 5, but asserting the
//  repeated-number contract: the hard cap makes 4+ repeats impossible,
//  and tiered selection drives the triple rate well below the pre-fix
//  tolerance.  Operator balance must not regress below its floor.

describe('planner — repeated-number guarantees (÷ disabled, 30 puzzles)', () => {
  it('no equation floods a number; excessive triples stay rare', () => {
    const cfg = {
      mode: 'plain',
      totalTile: 9,
      operatorSpec: { '+': [0, 4], '-': [0, 4], '×': [0, 4], '÷': [0, 0] },
    };
    const cfgList = Array.from({ length: 30 }, () => cfg);
    const allowedOperators = deriveAllowedOperatorsFromConfigs(cfgList);

    const batch = buildDiversityBalancedBatch(
      cfgList,
      (c) => generateBingo(c),
      { allowedOperators, candidatesPerCfg: 5 },
    );
    expect(batch.length).toBe(30);

    const stats = analyzeGeneratedPuzzles(batch, { allowedOperators, requestedCount: 30 });

    // HARD guarantee from repeatHardCap=4: no equation repeats a number 4+ times.
    expect(stats.repeatRisk.severeRate).toBe(0);
    // Tiered soft cap makes triples rare — well under the pre-fix 0.20.
    expect(stats.repeatRisk.excessiveRate).toBeLessThan(0.10);
    // Operator balance must not have regressed below its established floor.
    expect(stats.operatorBalance.score).toBeGreaterThan(0.30);
  }, 60_000);
});
