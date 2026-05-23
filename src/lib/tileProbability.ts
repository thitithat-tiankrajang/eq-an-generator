// ================================================================
//  tileProbability — A-Math tile-bag weighted sampling helpers
// ================================================================
//
//  WHY THIS EXISTS
//  ---------------
//  The generator's `pickNumForBudget(1)` in equationConstructors.js used
//  to enumerate every possible single-tile value (light digits 1-9 plus
//  heavy tiles 10-20) and pick UNIFORMLY at random:
//
//       cands[0 | (Math.random() * cands.length)]
//
//  In the real A-Math bag, however, each light digit has FOUR copies
//  while each heavy tile (10-20) has only ONE.  Uniform sampling over
//  the 20 candidates therefore gave heavies a ~55% probability when the
//  true bag rate is ~23%.  Equations ended up flooded with heavies,
//  visibly biasing the generated puzzles away from authentic A-Math
//  tile draws.
//
//  This module exposes a small, side-effect-free utility that other
//  parts of the codebase can adopt incrementally.  Every function takes
//  an injectable RNG so tests can pin determinism without monkey-
//  patching `Math.random`.
//
//  WHAT IT DOES
//  ------------
//   • weightedPickByPool(candidates, poolDef, toKey?, rng?)
//       Pick one candidate proportional to its tile-count in `poolDef`.
//       Items whose pool count is 0 (or missing) are excluded from the
//       draw entirely; returns null if every candidate has zero weight.
//
//   • tileWeightDistribution(candidates, poolDef, toKey?)
//       Returns a candidate → probability map.  Useful for sanity tests
//       and dev-time inspection.
//
//   • makeSeededRng(seed)
//       Mulberry32-based deterministic RNG for tests.  Same seed →
//       identical sequence.  Use this in unit tests; production code
//       should keep using the default `Math.random` argument.
//
//  WHAT IT DOES NOT DO
//  -------------------
//   • It does not touch the generator pipeline.  Adopt it explicitly
//     from a callsite that wants weighted sampling.
//   • It does not redefine the pool — POOL_DEF (amathTokens.ts) is the
//     single source of truth; we just consume it.
//
//  Keep this file tiny and pure.  Anything generator-specific belongs
//  in the generator module, not here.

import { POOL_DEF } from './amathTokens';
import type { AmathToken } from '../types/EquationAnagram';

// A "tile pool" is just a map from tile token string to integer count.
// We use a permissive shape so callers don't have to narrow to AmathToken.
export type TilePool = Readonly<Record<string, number>>;
export type RNG = () => number;

/**
 * Pick one item from `candidates` weighted by its tile-count in `poolDef`.
 *
 *   weight(c) = poolDef[toKey(c)] ?? 0
 *
 * Items with zero or missing weight are skipped entirely.  Returns null
 * when no candidate has positive weight (e.g. caller passed an empty
 * list, or every candidate is absent from the pool).
 *
 * @param candidates  Things to choose between.  Order doesn't affect the
 *                    final draw probability; we still iterate in order
 *                    for predictable behaviour under a seeded RNG.
 * @param poolDef     Tile-count map (POOL_DEF or a custom pool).
 * @param toKey       Maps a candidate to its lookup key in poolDef.
 *                    Defaults to `String(item)` so numeric tokens
 *                    (e.g. 1..20) work out of the box.
 * @param rng         () => number in [0, 1).  Defaults to Math.random.
 *                    Inject a deterministic RNG (see makeSeededRng) in
 *                    tests.
 */
export function weightedPickByPool<T>(
  candidates: readonly T[],
  poolDef: TilePool,
  toKey: (item: T) => string = (x) => String(x),
  rng: RNG = Math.random,
): T | null {
  if (candidates.length === 0) return null;

  // Compute weights upfront so we only walk the array twice.  This keeps
  // hot paths (the constructor inner loops can call us thousands of
  // times) cheap and predictable.
  let total = 0;
  const weights: number[] = new Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const w = poolDef[toKey(candidates[i]) as AmathToken] ?? 0;
    weights[i] = w > 0 ? w : 0;
    total += weights[i];
  }
  if (total <= 0) return null;

  // Standard inverse-CDF roll.  We multiply rng() by `total` once and
  // walk the array — equivalent to picking a tile uniformly at random
  // from the bag.
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    if (weights[i] === 0) continue;
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  // Floating-point safety net: if r never went strictly <= 0, return the
  // last positive-weight candidate.
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (weights[i] > 0) return candidates[i];
  }
  return null;
}

/**
 * Build a candidate → probability map driven by `poolDef` weights.
 *
 * Probabilities are normalised over candidates with positive weight; a
 * candidate with zero/missing pool count maps to 0 (not omitted) so
 * tests can iterate the full domain.
 */
export function tileWeightDistribution<T>(
  candidates: readonly T[],
  poolDef: TilePool,
  toKey: (item: T) => string = (x) => String(x),
): Map<T, number> {
  const dist = new Map<T, number>();
  let total = 0;
  const weights: number[] = new Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const w = poolDef[toKey(candidates[i]) as AmathToken] ?? 0;
    weights[i] = w > 0 ? w : 0;
    total += weights[i];
  }
  for (let i = 0; i < candidates.length; i++) {
    dist.set(candidates[i], total > 0 ? weights[i] / total : 0);
  }
  return dist;
}

/**
 * Mulberry32 — a small deterministic PRNG used only by tests.  Same
 * seed → identical sequence, so we can pin distribution checks without
 * monkey-patching Math.random.  Sufficient quality for behaviour tests;
 * NOT cryptographic.
 */
export function makeSeededRng(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Re-export the canonical pool for convenience. */
export { POOL_DEF };
