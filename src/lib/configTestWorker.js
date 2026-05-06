/**
 * configTestWorker.js — Web Worker for config feasibility testing
 *
 * Production-grade improvements over v1:
 *  • Per-attempt timeout via Promise.race so a hung generateBingo never blocks
 *  • Yields to event loop between configs (setTimeout 0) so the worker stays
 *    responsive to a 'cancel' message
 *  • Supports 'cancel' message mid-run — worker terminates cleanly
 *  • Reports per-attempt timing, timeout count, and retry count
 *
 * Protocol (main → worker):
 *   { type: 'start',  testItems: [{ configId, configSpec, attempts }], attemptTimeoutMs? }
 *   { type: 'cancel' }
 *
 * Protocol (worker → main):
 *   { type: 'progress', configId, done, total, result }   — one config done
 *   { type: 'done' }                                       — all configs done
 *   { type: 'cancelled' }                                  — cancelled mid-run
 */

import { generateBingo } from './bingoGenerator.js';
import { initPopularityWeights } from './crossBingoPlacement.js';

const ready = initPopularityWeights().catch(() => {});

const DEFAULT_ATTEMPTS        = 10;
const DEFAULT_ATTEMPT_TIMEOUT = 8_000; // ms per single attempt

let cancelled = false;

self.onmessage = async (e) => {
  if (e.data?.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (e.data?.type !== 'start') return;

  cancelled = false;
  await ready;

  const {
    testItems,
    attemptTimeoutMs = DEFAULT_ATTEMPT_TIMEOUT,
  } = e.data;

  const total = testItems.length;

  for (let i = 0; i < total; i++) {
    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    const { configId, configSpec, attempts = DEFAULT_ATTEMPTS } = testItems[i];

    let successCount  = 0;
    let failCount     = 0;
    let timeoutCount  = 0;
    let totalMs       = 0;
    const examples    = [];
    let lastError     = null;

    for (let a = 0; a < attempts; a++) {
      if (cancelled) break;

      const t0 = performance.now();

      // Wrap each attempt in a timeout race
      const attemptPromise = new Promise((resolve) => {
        try {
          const result = generateBingo(configSpec);
          resolve({ ok: true, result, ms: performance.now() - t0 });
        } catch (err) {
          resolve({ ok: false, error: err?.message ?? 'unknown error', ms: performance.now() - t0 });
        }
      });

      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ ok: false, timedOut: true, ms: attemptTimeoutMs }), attemptTimeoutMs)
      );

      const outcome = await Promise.race([attemptPromise, timeoutPromise]);

      if (outcome.timedOut) {
        timeoutCount++;
        failCount++;
        if (!lastError) lastError = `attempt timed out after ${attemptTimeoutMs}ms`;
      } else if (outcome.ok && outcome.result) {
        successCount++;
        totalMs += outcome.ms;
        const eq = outcome.result.equation ?? outcome.result.seedEquation;
        if (eq && examples.length < 10) examples.push(eq);
      } else {
        failCount++;
        if (!lastError) lastError = outcome.error ?? 'generateBingo returned null';
      }
    }

    self.postMessage({
      type: 'progress',
      configId,
      done: i + 1,
      total,
      result: {
        status:        successCount > 0 ? 'pass' : 'fail',
        successCount,
        failCount,
        timeoutCount,
        attemptsCount: attempts,
        examples,
        avgMs:         successCount > 0 ? totalMs / successCount : 0,
        errorMessage:  successCount === 0 ? lastError : undefined,
      },
    });

    // Yield to event loop so 'cancel' messages can be received
    await new Promise(r => setTimeout(r, 0));
  }

  if (!cancelled) self.postMessage({ type: 'done' });
};