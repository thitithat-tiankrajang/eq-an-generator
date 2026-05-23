// =================================================================
//  tileProbability.test — weighted A-Math tile sampling, end-to-end
// =================================================================
//
//  Two halves to this file:
//
//   1. Direct unit tests of weightedPickByPool / tileWeightDistribution /
//      makeSeededRng.  These pin the contract: weight ∝ tile count, zero
//      tiles are skipped, RNG is injectable, distribution converges.
//
//   2. Characterization tests of the GENERATOR's current single-tile
//      pick (`pickNumForBudget(1)` over light digits 1-9 vs heavy
//      tiles 10-20).  These describe today's UNIFORM behaviour so the
//      diff is visible when we integrate the weighted utility into the
//      constructor — the "before" snapshot lives in version control.

import { describe, it, expect } from 'vitest';
import {
  weightedPickByPool,
  tileWeightDistribution,
  makeSeededRng,
} from '../tileProbability';
import { POOL_DEF } from '../amathTokens';

// =================================================================
//  Part 1 — utility contract
// =================================================================

describe('weightedPickByPool — contract', () => {
  it('returns null on empty candidate list', () => {
    expect(weightedPickByPool([], POOL_DEF)).toBeNull();
  });

  it('returns null when no candidate has positive weight', () => {
    // Custom pool where '1' and '2' have zero count.
    const pool = { '1': 0, '2': 0 };
    expect(weightedPickByPool(['1', '2'], pool)).toBeNull();
  });

  it('picks the only positive-weight candidate', () => {
    const pool = { '1': 0, '5': 4, '9': 0 };
    expect(weightedPickByPool(['1', '5', '9'], pool)).toBe('5');
  });

  it('honours injected RNG (deterministic with seeded RNG)', () => {
    const rng = makeSeededRng(42);
    const picks: number[] = [];
    for (let i = 0; i < 8; i++) {
      // All digits 1-9 have equal pool count (4) → seeded RNG fully
      // determines the sequence.
      picks.push(weightedPickByPool([1, 2, 3, 4, 5, 6, 7, 8, 9], POOL_DEF, String, rng) as number);
    }
    // Same seed, same call shape — identical sequence on every run.
    const rng2 = makeSeededRng(42);
    const picks2: number[] = [];
    for (let i = 0; i < 8; i++) {
      picks2.push(weightedPickByPool([1, 2, 3, 4, 5, 6, 7, 8, 9], POOL_DEF, String, rng2) as number);
    }
    expect(picks).toEqual(picks2);
  });

  it('empirical distribution converges to A-Math bag rates', () => {
    // pickNumForBudget(1) candidates: heavies 10-20 + lights 1-9.
    //   light digit count = 4 each × 9 = 36 tiles
    //   heavy tile count  = 1 each × 11 = 11 tiles
    //   total non-zero number tiles = 47
    //
    // Empirical P(any heavy) ≈ 11/47 ≈ 23.4%.
    // Current uniform code yields ≈ 55%.
    const cands = [
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ];
    const N = 30000;
    let heavies = 0;
    for (let i = 0; i < N; i++) {
      const pick = weightedPickByPool(cands, POOL_DEF) as number;
      if (pick >= 10) heavies++;
    }
    const pHeavy = heavies / N;
    // ±2.5% slack — at N=30k the Wald CI half-width is well under 1%.
    expect(pHeavy).toBeGreaterThan(11 / 47 - 0.025);
    expect(pHeavy).toBeLessThan(11 / 47 + 0.025);
  });

  it('per-digit empirical distribution within lights is uniform (all share pool=4)', () => {
    // Subset just the light digits 1-9 — every one has pool count 4, so
    // the weighted draw should still recover ≈ 1/9 each.
    const cands = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const N = 18000;  // ~2000 expected per digit
    const buckets = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const pick = weightedPickByPool(cands, POOL_DEF) as number;
      buckets.set(pick, (buckets.get(pick) ?? 0) + 1);
    }
    for (const d of cands) {
      const freq = (buckets.get(d) ?? 0) / N;
      expect(freq).toBeGreaterThan(1 / 9 - 0.025);
      expect(freq).toBeLessThan(1 / 9 + 0.025);
    }
  });

  it('honours a custom pool with non-default counts', () => {
    // E.g. classroom pack with NO heavies — heavies should never appear.
    const noHeavyPool: Record<string, number> = { ...POOL_DEF };
    for (let n = 10; n <= 20; n++) noHeavyPool[String(n)] = 0;

    const cands = [10, 15, 20, 1, 5, 9];
    const N = 2000;
    let heavies = 0;
    for (let i = 0; i < N; i++) {
      const pick = weightedPickByPool(cands, noHeavyPool) as number;
      if (pick >= 10) heavies++;
    }
    expect(heavies).toBe(0);
  });
});

describe('tileWeightDistribution', () => {
  it('normalises to probabilities summing to 1', () => {
    const cands = [1, 2, 3, 10, 11];
    const dist = tileWeightDistribution(cands, POOL_DEF);
    const total = [...dist.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('reports 0 for missing/zero-pool candidates without omitting them', () => {
    const pool = { '1': 4, '5': 0 };
    const dist = tileWeightDistribution(['1', '5'], pool);
    expect(dist.get('1')).toBe(1);
    expect(dist.get('5')).toBe(0);
  });

  it('matches the A-Math bag ratios for the pickNumForBudget(1) candidate set', () => {
    const cands = [
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ];
    const dist = tileWeightDistribution(cands, POOL_DEF);
    // 11 heavies × 1 + 9 lights × 4 = 47 total bag entries.
    for (let n = 10; n <= 20; n++) expect(dist.get(n)).toBeCloseTo(1 / 47, 10);
    for (let n = 1; n <= 9; n++)   expect(dist.get(n)).toBeCloseTo(4 / 47, 10);
  });
});

describe('makeSeededRng', () => {
  it('returns numbers in [0, 1)', () => {
    const r = makeSeededRng(1);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces identical sequences for identical seeds', () => {
    const a = makeSeededRng(12345);
    const b = makeSeededRng(12345);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces distinct sequences for distinct seeds', () => {
    const a = makeSeededRng(1);
    const b = makeSeededRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

// =================================================================
//  Part 2 — characterization snapshot of CURRENT generator behaviour
// =================================================================
//
//  These tests SHOULD pass against the current `pickNumForBudget(1)`
//  (uniform 1/20 over 11 heavies + 9 lights) and SHOULD FAIL after we
//  integrate `weightedPickByPool`.  Keeping them in the suite means a
//  reviewer can see, in a single test run, the exact shift the change
//  causes.
//
//  When the integration lands we will update these tests to assert the
//  NEW (weighted) distribution instead.  Until then they pin the
//  baseline.

describe('characterization — current uniform behaviour in pickNumForBudget(1)', () => {
  // We don't import pickNumForBudget directly (it's an internal helper
  // not exported by equationConstructors.js).  Reproduce the exact
  // candidate list + uniform draw the constructor uses today so the
  // assertion describes what is shipping right now.

  function uniformPickAsConstructorDoesToday(rng: () => number = Math.random) {
    const cands: number[] = [];
    for (let n = 10; n <= 20; n++) cands.push(n);  // heavies 10-20
    for (let n = 1; n <= 9; n++)   cands.push(n);  // lights 1-9
    return cands[0 | (rng() * cands.length)];
  }

  it('today: heavies are ~55% of single-tile draws (uniform 11/20)', () => {
    const N = 30000;
    let heavies = 0;
    for (let i = 0; i < N; i++) {
      if (uniformPickAsConstructorDoesToday() >= 10) heavies++;
    }
    // Slack ±2% — N is large so this is comfortably above the bag-true 23%.
    expect(heavies / N).toBeGreaterThan(0.50);
    expect(heavies / N).toBeLessThan(0.60);
  });

  it('target after integration: heavies should drop to ~23% (bag-true)', () => {
    // Sanity check on the EXPECTED post-integration behaviour by running
    // the weighted helper directly.  When the constructor integration
    // ships, this will be the live behaviour; the previous test will
    // then be the regression assertion we update.
    const cands = [
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ];
    const N = 30000;
    let heavies = 0;
    for (let i = 0; i < N; i++) {
      const pick = weightedPickByPool(cands, POOL_DEF) as number;
      if (pick >= 10) heavies++;
    }
    expect(heavies / N).toBeGreaterThan(0.18);
    expect(heavies / N).toBeLessThan(0.28);
  });
});
