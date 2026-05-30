/**
 * bingoWorker.js — Web Worker for puzzle generation
 *
 * Runs generateBingo() in a separate thread so the UI never freezes.
 * Cancel by calling worker.terminate() from the main thread.
 *
 * Protocol (main → worker):
 *   { type: 'generate', cfgList: object[], plannerOptions?: object }
 *
 *   plannerOptions (all optional):
 *     allowedOperators:    string[]  // override (else derived from cfgList)
 *     candidatesPerCfg:    number    // default 3 (set 1 to disable planner)
 *     topConcentrationTarget: number // default 0.30
 *     repeatHardCap:       number    // default 4 (reject N+ copies of one number)
 *     repeatSoftCap:       number    // default 2 (prefer <= this many copies)
 *     weights:             object    // see DEFAULT_PLANNER_WEIGHTS
 *
 * Protocol (worker → main):
 *   { type: 'result',  result, done, total }  — one puzzle done
 *   { type: 'done' }                           — all puzzles complete
 *   { type: 'error',   message: string }       — generator threw
 *
 * Diversity planner integration
 * -----------------------------
 * For each cfg slot we draw K candidates (candidatesPerCfg) and pick the
 * one that best balances the running batch.  See generatorDiversityPlanner
 * for the scoring contract.  The pre-planner behaviour (single shot per
 * cfg) is preserved by passing candidatesPerCfg=1.
 *
 * Cancellation behaviour is unchanged: the main thread terminates the
 * worker via worker.terminate(), which aborts the in-flight loop
 * mid-iteration.  The planner does not introduce any new failure modes
 * here — it just runs more generateBingo calls per slot.
 */

import { generateBingo } from './bingoGenerator.js';
import { initPopularityWeights } from './crossBingoPlacement.js';
import { deriveAllowedOperatorsFromConfigs } from './diversityAnalysis.js';
import { pickBestCandidate, pickLeastRepetitiveCandidate } from './generatorDiversityPlanner.js';

// Pre-load strip-freq.json once when worker boots.
// If it fails, generator falls back to pure heatmap (still works, just different distribution).
const ready = initPopularityWeights().catch(() => {});

self.onmessage = async (e) => {
  if (e.data?.type !== 'generate') return;

  await ready;

  const { cfgList, plannerOptions = {} } = e.data;
  const total = cfgList.length;

  // Resolve planner options once.  Allowed operators come from caller
  // override → fall back to deriving from the cfg list (so e.g. a
  // batch with ÷ disabled in every cfg automatically rejects ÷ even
  // if some upstream realiser smuggles one in).
  const candidatesPerCfg = Math.max(1, Math.floor(plannerOptions.candidatesPerCfg ?? 3));
  const allowedOperators = plannerOptions.allowedOperators
    ?? deriveAllowedOperatorsFromConfigs(cfgList);
  const plannerCfg = {
    ...plannerOptions,
    allowedOperators,
    candidatesPerCfg,
  };

  // Running batch — passed to pickBestCandidate as `existingResults`.
  const committedResults = [];

  for (let i = 0; i < total; i++) {
    // Gather K candidates for this slot.  Retry indefinitely until we
    // have at least one candidate the planner can accept; the main
    // thread cancels by terminating the worker, which aborts the
    // outer loop mid-iteration.
    while (true) {
      const candidates = [];
      // Round 1: K independent draws.
      while (candidates.length < candidatesPerCfg) {
        try {
          const c = generateBingo(cfgList[i]);
          if (c?.equation) candidates.push(c);
        } catch {
          // Hard cfg — silently retry until we get a valid candidate.
          // This matches the pre-planner worker's "retry forever" loop.
        }
      }

      const picked = pickBestCandidate(committedResults, candidates, plannerCfg);
      if (picked) {
        committedResults.push(picked.candidate);
        self.postMessage({
          type: 'result',
          result: picked.candidate,
          done: i + 1,
          total,
        });
        break;
      }

      // All K candidates failed the hard filter (e.g. they all emit a
      // disallowed operator the cfg should have suppressed, or every draw
      // floods one number past the repeat hard cap).  Round 2: try one
      // more batch of K candidates; if STILL no acceptable candidate, fall
      // back to the LEAST repetitive draw so we don't loop forever on a
      // permanently-broken cfg.  This is the same pragmatic compromise as
      // buildDiversityBalancedBatch.
      const extras = [];
      while (extras.length < candidatesPerCfg) {
        try {
          const c = generateBingo(cfgList[i]);
          if (c?.equation) extras.push(c);
        } catch { /* retry */ }
      }
      const picked2 = pickBestCandidate(committedResults, extras, plannerCfg);
      if (picked2) {
        committedResults.push(picked2.candidate);
        self.postMessage({
          type: 'result',
          result: picked2.candidate,
          done: i + 1,
          total,
        });
        break;
      }

      // Both rounds hard-rejected — accept the least-repetitive draw across
      // both rounds so the batch size stays correct.  This should be very
      // rare and only happens when the cfg itself is inconsistent with the
      // planner's allowedOperators (or genuinely cannot avoid a flooded
      // number).  candidates[0] is the final safety net.
      const fallback =
        pickLeastRepetitiveCandidate([...candidates, ...extras]) ?? candidates[0];
      committedResults.push(fallback);
      self.postMessage({
        type: 'result',
        result: fallback,
        done: i + 1,
        total,
      });
      break;
    }
  }

  self.postMessage({ type: 'done' });
};
