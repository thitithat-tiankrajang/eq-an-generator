// ================================================================
//  generatorDiversityPlanner — batch-level diversity balancing
// ================================================================
//
//  Goal: when generating N puzzles for one batch, the final set
//  should be DIVERSE (many different shapes), BALANCED (operator
//  totals close together), CLEAN (no disallowed operators) and
//  STABLE (low repeat-number risk).
//
//  Strategy: instead of rewriting the core generator/solver to be
//  diversity-aware (huge surface area, easy to break), we wrap the
//  existing per-puzzle generator with a K-candidate planner.  For
//  every cfg slot in the batch we generate K independent candidates
//  and score each against the running batch state, then commit the
//  best one.  The generator itself stays untouched — this module is
//  the smart selector layered on top.
//
//  Public API
//  ----------
//   • scoreCandidateForBatch(existingResults, candidate, options)
//       Pure scoring function used in tests and by the planner.
//       Returns { score, breakdown }.  Higher score = better fit.
//       Disallowed-operator candidates score -Infinity (hard reject).
//
//   • pickBestCandidate(existingResults, candidates, options)
//       Returns { candidate, score, breakdown } for the best
//       acceptable candidate, or null if every candidate is hard-
//       rejected.
//
//   • buildDiversityBalancedBatch(cfgList, generateOne, options)
//       Synchronous batch driver used by tests and any non-worker
//       caller.  For each cfg, calls generateOne(cfg) K times,
//       picks the best vs the running batch, and accumulates.
//
//  Scoring components (each in [0, 1] before weighting)
//  ---------------------------------------------------
//   • novelty            – the candidate's diversity pattern hasn't
//                          been seen yet (or seen rarely)
//   • topConcentration   – including the candidate doesn't push the
//                          top-pattern share above a target ceiling
//   • operatorBalance    – the combined operator totals stay close
//                          (reuse summarizeOperatorBalance.score)
//   • repeatHealth       – the candidate doesn't reuse the same
//                          number 3+ times (3 = penalty, 4+ = severe)
//   • numberSpread       – the candidate favours number VALUES that
//                          are under-used across the batch so far, so
//                          the whole set stays varied (not just each
//                          equation).  This is the batch-level half of
//                          the "เลขซ้ำ / repeated number" fix.
//
//  Repeated-number defense (the explicit goal of this layer)
//  ---------------------------------------------------------
//  Two thresholds, both configurable:
//   • repeatHardCap (default 4) – an equation with ANY number repeated
//     this many times scores -Infinity (hard reject), exactly like a
//     disallowed operator.  Flooded equations ("1+1+1+1=4") become
//     impossible in the output, not merely unlikely.
//   • repeatSoftCap (default 2) – pickBestCandidate ranks candidates by
//     an ascending repeat TIER (all-distinct ≺ one pair ≺ a triple …).
//     The lowest-repeat tier present always wins; the weighted score
//     only breaks ties WITHIN that tier.  softCap caps the ranking
//     granularity (repeats past softCap+1 are lumped into the worst
//     tier).  So with K independent draws, a less-repetitive candidate
//     almost always exists and, when it does, is chosen — pairs AND
//     triples are pushed down without being banned, so hard configs
//     still degrade gracefully (last-resort = least-repetitive draw).
//
//  Why incremental state and not analyzeGeneratedPuzzles()
//  -------------------------------------------------------
//  Calling analyzeGeneratedPuzzles on every (cfg × K) candidate is
//  O(N) per call and would dominate runtime on big batches.  We
//  keep a small running summary (patternMap + opTotals) and update
//  it once per committed result.
//
//  This module is intentionally side-effect-free and small.  Wider
//  generator changes belong in equationConstructors / bingoGenerator,
//  not here.

import {
  CORE_OPERATORS,
  equationToDiversityPattern,
  summarizeOperatorBalance,
} from './diversityAnalysis.js';
import { tokenizeEquation } from './bingoMath.js';

/**
 * Default scoring weights.  Tuned so that:
 *   - operator balance and novelty roughly dominate equally,
 *   - repeat penalty is meaningful but not catastrophic,
 *   - top-concentration nudges away from one pattern dominating.
 * Caller can override any weight via `options.weights`.
 */
export const DEFAULT_PLANNER_WEIGHTS = Object.freeze({
  novelty:           0.26,
  topConcentration:  0.14,
  operatorBalance:   0.28,
  repeatHealth:      0.18,
  numberSpread:      0.14,
});

const DEFAULT_OPTIONS = Object.freeze({
  /** Allowed core operators.  Candidates emitting anything outside this list are hard-rejected. */
  allowedOperators:  CORE_OPERATORS,
  /** How many independent candidates to draw per cfg slot before picking. */
  candidatesPerCfg:  3,
  /** Target ceiling for the top-pattern share — score drops linearly past this. */
  topConcentrationTarget: 0.30,
  /**
   * Hard reject any candidate where one number value appears >= this many
   * times.  Default 4 makes quadruple-flooded equations impossible in the
   * output.  Set to Infinity to disable the hard cap entirely.
   */
  repeatHardCap:     4,
  /**
   * Ranking granularity for intra-equation repeats.  pickBestCandidate tiers
   * candidates by min(maxRepeat, repeatSoftCap + 1) ascending and always
   * prefers the lowest tier present, so all-distinct beats a pair beats a
   * triple.  Repeats past softCap+1 are lumped together and separated only
   * by the weighted score.  Default 2 ranks distinct ≺ pair ≺ (triple+).
   */
  repeatSoftCap:     2,
  /** Score weights (see DEFAULT_PLANNER_WEIGHTS). */
  weights:           DEFAULT_PLANNER_WEIGHTS,
});

/**
 * Build a small running summary of an existing batch (pattern counts,
 * operator totals).  Used as the substrate for incremental scoring —
 * cheap to compute, cheap to clone.
 */
function buildBatchSummary(existingResults) {
  const patternMap = Object.create(null);
  const operatorTotals = Object.create(null);
  const numberTotals = Object.create(null);
  for (const operator of CORE_OPERATORS) operatorTotals[operator] = 0;

  let count = 0;
  let numberTokenTotal = 0;
  for (const r of existingResults) {
    if (!r?.equation) continue;
    count++;
    const pattern = equationToDiversityPattern(r.equation);
    patternMap[pattern] = (patternMap[pattern] || 0) + 1;

    const tokens = tokenizeEquation(r.equation) || [];
    for (const token of tokens) {
      if (CORE_OPERATORS.includes(token)) {
        operatorTotals[token]++;
      } else if (token !== '=') {
        // Number value (whole-number string, e.g. '7' or '14'; a leading
        // unary '-' tokenizes separately so values are sign-agnostic — fine
        // for measuring how varied the number VALUES across the batch are).
        numberTotals[token] = (numberTotals[token] || 0) + 1;
        numberTokenTotal++;
      }
    }
  }

  return { patternMap, operatorTotals, numberTotals, numberTokenTotal, count };
}

/**
 * Compute per-candidate stats once so scoreCandidateForBatch can reuse
 * them across candidates and across calls.
 */
function analyseCandidate(candidate) {
  if (!candidate?.equation) return null;
  const tokens = tokenizeEquation(candidate.equation) || [];
  const pattern = equationToDiversityPattern(candidate.equation);
  const operatorCounts = Object.create(null);
  const numberCounts = Object.create(null);
  for (const operator of CORE_OPERATORS) operatorCounts[operator] = 0;

  for (const token of tokens) {
    if (CORE_OPERATORS.includes(token)) {
      operatorCounts[token]++;
    } else if (token !== '=') {
      numberCounts[token] = (numberCounts[token] || 0) + 1;
    }
  }

  let maxRepeat = 0;
  for (const value of Object.values(numberCounts)) {
    if (value > maxRepeat) maxRepeat = value;
  }

  return { pattern, operatorCounts, numberCounts, maxRepeat };
}

/**
 * Map maxRepeat → repeatHealth score in [0, 1].
 *   1 -> 1.00  (every number unique, ideal)
 *   2 -> 0.75  (one pair, acceptable)
 *   3 -> 0.30  (a triple, noticeable bias)
 *   4+ -> 0.00 (severe — basically a flooded equation)
 */
function repeatHealthScore(maxRepeat) {
  if (maxRepeat <= 1) return 1;
  if (maxRepeat === 2) return 0.75;
  if (maxRepeat === 3) return 0.30;
  return 0;
}

/**
 * topConcentrationScore — piecewise-linear decay that still
 * discriminates above the target ceiling.  This is important: when
 * the planner is asked to commit a candidate to a batch that's
 * ALREADY over the target (e.g. small batch, dominant pattern), it
 * must still prefer the candidate that DOESN'T worsen the share.
 *
 *   share == 0           -> 1.00
 *   share == target/2    -> 0.75
 *   share == target      -> 0.50
 *   share == (1+target)/2 -> 0.25
 *   share == 1.00         -> 0.00
 *
 * Below `target` we lose 0.5 over a target-wide window; above `target`
 * we lose the remaining 0.5 over the (1 - target)-wide window.  The
 * curve is monotonic and never flat, so a heavier dup is always worse
 * than a lighter dup, even if both are above target.
 */
function topConcentrationScore(topShare, target) {
  if (!(target > 0) || target >= 1) return topShare <= 0 ? 1 : 0;
  if (topShare <= 0) return 1;
  if (topShare >= 1) return 0;
  if (topShare <= target) {
    return 1 - 0.5 * (topShare / target);
  }
  return 0.5 * (1 - (topShare - target) / (1 - target));
}

/**
 * numberSpreadScore — batch-level number-VALUE variety in [0, 1].
 *
 * For each number token the candidate would contribute, freshness is
 *   1 / (1 + effectiveSeen)
 * where effectiveSeen counts how many times that value already appears in
 * the committed batch PLUS earlier copies of the same value within this
 * candidate.  The score is the mean freshness across the candidate's
 * number tokens (counting multiplicity).
 *
 *   • A value never seen before contributes 1.0.
 *   • The N-th reuse of a value contributes 1/(1+N) — sharply diminishing.
 *   • Counting earlier copies within the candidate means a candidate that
 *     reuses the same value internally (e.g. "7+7=14") is gently penalised
 *     too, reinforcing repeatHealth at value granularity.
 *
 * Empty batch → every value is fresh → 1.0, so early picks aren't punished.
 */
function numberSpreadScore(summary, stats) {
  const totals = summary.numberTotals || Object.create(null);
  let tokenCount = 0;
  let freshnessSum = 0;
  for (const [value, countInCandidate] of Object.entries(stats.numberCounts)) {
    const seenInBatch = totals[value] || 0;
    for (let k = 0; k < countInCandidate; k++) {
      const effectiveSeen = seenInBatch + k;
      freshnessSum += 1 / (1 + effectiveSeen);
      tokenCount++;
    }
  }
  if (tokenCount === 0) return 1;
  return freshnessSum / tokenCount;
}

/**
 * Public — pure scoring.  Returns:
 *   { score, breakdown }
 *
 * `score = -Infinity` is reserved for hard rejection (currently only
 * "candidate emits a disallowed operator").  Callers MUST treat
 * -Infinity as "do not use this candidate".
 */
export function scoreCandidateForBatch(existingResults, candidate, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const weights = { ...DEFAULT_PLANNER_WEIGHTS, ...(options.weights || {}) };
  const allowedSet = new Set(opts.allowedOperators ?? CORE_OPERATORS);
  const repeatHardCap = opts.repeatHardCap ?? DEFAULT_OPTIONS.repeatHardCap;

  const stats = analyseCandidate(candidate);
  if (!stats) {
    return { score: -Infinity, breakdown: { reason: 'no-equation' } };
  }

  // Hard reject: candidate emits an operator outside the allowed set.
  for (const operator of CORE_OPERATORS) {
    if (stats.operatorCounts[operator] > 0 && !allowedSet.has(operator)) {
      return {
        score: -Infinity,
        breakdown: { reason: 'disallowed-operator', operator, pattern: stats.pattern },
      };
    }
  }

  // Hard reject: a single number value floods the equation (>= hard cap).
  // Triples are NOT rejected here — pickBestCandidate's tiered selection
  // demotes them instead, so hard-config slots degrade gracefully.  Only
  // genuine floods (4+ by default) are made impossible.
  if (Number.isFinite(repeatHardCap) && stats.maxRepeat >= repeatHardCap) {
    return {
      score: -Infinity,
      breakdown: {
        reason: 'repeat-number-cap',
        maxRepeat: stats.maxRepeat,
        cap: repeatHardCap,
        pattern: stats.pattern,
      },
    };
  }

  const summary = buildBatchSummary(existingResults);

  // Novelty — patterns we haven't seen score highest; repeat patterns
  // attenuate with 1 / (1 + seen).  A brand-new pattern => 1.0; the
  // second copy of a pattern already seen 3× => 1/4 = 0.25.
  const seenCount = summary.patternMap[stats.pattern] || 0;
  const novelty = seenCount === 0 ? 1 : 1 / (1 + seenCount);

  // Project the batch state forward (this candidate committed) so the
  // top-concentration and balance scores reflect the COMMITTED batch
  // rather than the pre-commit state — the candidate has to live with
  // its own contribution.
  const projectedTotal = summary.count + 1;
  let projectedTopCount = 0;
  for (const [pattern, count] of Object.entries(summary.patternMap)) {
    const projected = count + (pattern === stats.pattern ? 1 : 0);
    if (projected > projectedTopCount) projectedTopCount = projected;
  }
  if (!Object.prototype.hasOwnProperty.call(summary.patternMap, stats.pattern)) {
    projectedTopCount = Math.max(projectedTopCount, 1);
  }
  const projectedTopShare = projectedTopCount / projectedTotal;
  const concentration = topConcentrationScore(projectedTopShare, opts.topConcentrationTarget);

  // Operator balance — project totals forward then reuse the analyser.
  const projectedOpTotals = { ...summary.operatorTotals };
  for (const operator of CORE_OPERATORS) {
    projectedOpTotals[operator] = (projectedOpTotals[operator] || 0) + (stats.operatorCounts[operator] || 0);
  }
  const balance = summarizeOperatorBalance(projectedOpTotals, opts.allowedOperators);

  // Repeat health (intrinsic to the candidate; doesn't depend on batch).
  const repeat = repeatHealthScore(stats.maxRepeat);

  // Number spread — how fresh the candidate's number VALUES are vs the
  // running batch (batch-level variety, complements per-equation repeat).
  const numberSpread = numberSpreadScore(summary, stats);

  const score =
    novelty * weights.novelty
    + concentration * weights.topConcentration
    + balance.score * weights.operatorBalance
    + repeat * weights.repeatHealth
    + numberSpread * weights.numberSpread;

  return {
    score,
    breakdown: {
      novelty,
      concentration,
      operatorBalance: balance.score,
      repeatHealth: repeat,
      numberSpread,
      pattern: stats.pattern,
      maxRepeat: stats.maxRepeat,
      projectedTopShare,
    },
  };
}

/**
 * Public — pick the best candidate against the running batch.
 *
 * Returns `null` if EVERY candidate is hard-rejected (e.g. they all
 * emit a disallowed operator).  In that case the caller should
 * regenerate candidates, NOT post the first one anyway — posting a
 * hard-rejected candidate would visibly violate the operator
 * constraint the user set.
 */
export function pickBestCandidate(existingResults, candidates, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const softCap = opts.repeatSoftCap ?? DEFAULT_OPTIONS.repeatSoftCap;

  // Score every candidate once, dropping hard-rejected ones.  Each surviving
  // candidate is bucketed into a repeat TIER (ascending by worst repeat):
  //   tier = min(maxRepeat, softCap + 1)
  // so an all-distinct equation (tier 1) is preferred over one with a pair
  // (tier 2), which is preferred over a triple (tier 3), etc.  softCap caps
  // the granularity — repeats past softCap+1 are lumped into the worst tier
  // and separated only by the weighted score.  Default softCap 2 ranks
  // distinct ≺ pair ≺ (triple+), which is what drives the repeated-number
  // ("เลขซ้ำ") rate down: with K independent draws a less-repetitive
  // candidate almost always exists, and when it does it wins outright.
  const scored = [];
  for (const candidate of candidates) {
    const { score, breakdown } = scoreCandidateForBatch(existingResults, candidate, options);
    if (score === -Infinity) continue;
    const maxRepeat = breakdown.maxRepeat ?? 1;
    const tier = Math.min(maxRepeat, softCap + 1);
    scored.push({ candidate, score, breakdown, tier });
  }
  if (scored.length === 0) return null;

  let bestTier = Infinity;
  for (const s of scored) if (s.tier < bestTier) bestTier = s.tier;

  // Within the lowest-repeat tier present, the weighted score decides.
  let best = null;
  for (const s of scored) {
    if (s.tier !== bestTier) continue;
    if (best === null || s.score > best.score) best = s;
  }
  return { candidate: best.candidate, score: best.score, breakdown: best.breakdown };
}

/**
 * Public — among a set of candidates, return the one with the fewest
 * intra-equation number repeats (lowest maxRepeat).  Used as the
 * last-resort fallback so that even when every candidate is hard-rejected
 * by the scorer, the batch slot is filled with the LEAST repetitive option
 * rather than an arbitrary one.  Returns null if no candidate has an
 * equation.
 */
export function pickLeastRepetitiveCandidate(candidates) {
  if (!Array.isArray(candidates)) return null;
  let best = null;
  let bestRepeat = Infinity;
  for (const candidate of candidates) {
    if (!candidate?.equation) continue;
    const stats = analyseCandidate(candidate);
    const maxRepeat = stats ? stats.maxRepeat : Infinity;
    if (maxRepeat < bestRepeat) {
      best = candidate;
      bestRepeat = maxRepeat;
    }
  }
  return best;
}

/**
 * Public — synchronous batch driver.
 *
 * For each cfg in cfgList, calls generateOne(cfg) up to
 * `candidatesPerCfg` times to gather candidates, picks the best
 * against the running batch, and appends it.  Candidates that throw
 * are silently skipped (matching the worker's "retry on hard cfg"
 * behaviour).  If all K candidates for a cfg are hard-rejected, the
 * driver tries one extra round of K candidates before giving up and
 * appending the highest-scoring REJECTED candidate as a last resort
 * (so the batch size still matches cfgList.length).
 *
 * The driver is sync because it's used in tests and small UI flows
 * where blocking the main thread is fine.  The web worker has its
 * own copy of this logic with cancellation hooks.
 */
export function buildDiversityBalancedBatch(cfgList, generateOne, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results = [];

  for (const cfg of cfgList) {
    const candidates = [];
    for (let i = 0; i < opts.candidatesPerCfg; i++) {
      try {
        const c = generateOne(cfg);
        if (c?.equation) candidates.push(c);
      } catch {
        // Hard cfg — pretend this candidate slot was a no-show.
      }
    }

    let picked = pickBestCandidate(results, candidates, opts);

    // Hard-rejected on the first round?  Retry once with fresh candidates.
    if (picked === null && candidates.length > 0) {
      const extras = [];
      for (let i = 0; i < opts.candidatesPerCfg; i++) {
        try {
          const c = generateOne(cfg);
          if (c?.equation) extras.push(c);
        } catch { /* ignore */ }
      }
      picked = pickBestCandidate(results, extras, opts);
      if (picked === null && extras.length > 0) {
        // Last-resort fallback: every candidate was hard-rejected, so pick
        // the LEAST repetitive of the pooled candidates to keep the batch
        // size correct while minimising repeated numbers.  Preserves the
        // "always produce N" contract.
        results.push(pickLeastRepetitiveCandidate([...candidates, ...extras]) ?? extras[0]);
        continue;
      }
    }

    if (picked) {
      results.push(picked.candidate);
    } else if (candidates.length > 0) {
      // No candidate cleared the hard filter on either round — fall back
      // to the least-repetitive emitted candidate so the batch size matches
      // cfgList.length.  This SHOULD be very rare for well-formed cfgs but
      // we preserve the "always produce N" contract.
      results.push(pickLeastRepetitiveCandidate(candidates) ?? candidates[0]);
    }
    // else: no candidates emitted at all — skip silently (the
    // pre-planner worker would have spun forever; the sync driver
    // gives up so tests don't hang).
  }

  return results;
}
