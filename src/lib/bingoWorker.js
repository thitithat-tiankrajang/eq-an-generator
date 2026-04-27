/**
 * bingoWorker.js — Web Worker for puzzle generation
 *
 * Runs generateBingo() in a separate thread so the UI never freezes.
 * Cancel by calling worker.terminate() from the main thread.
 *
 * Protocol (main → worker):
 *   { type: 'generate', cfgList: object[] }
 *
 * Protocol (worker → main):
 *   { type: 'result',  result, done, total }  — one puzzle done
 *   { type: 'done' }                           — all puzzles complete
 *   { type: 'error',   message: string }       — generator threw
 */

import { generateBingo } from './bingoGenerator.js';
import { initPopularityWeights } from './crossBingoPlacement.js';

// Pre-load strip-freq.json once when worker boots.
// If it fails, generator falls back to pure heatmap (still works, just different distribution).
const ready = initPopularityWeights().catch(() => {});

self.onmessage = async (e) => {
  if (e.data?.type !== 'generate') return;

  await ready;

  const { cfgList } = e.data;
  const total = cfgList.length;

  for (let i = 0; i < total; i++) {
    // Retry indefinitely until the puzzle succeeds.
    // The main thread cancels by calling worker.terminate(), which aborts this loop.
    while (true) {
      try {
        const result = generateBingo(cfgList[i]);
        self.postMessage({ type: 'result', result, done: i + 1, total });
        break;
      } catch {
        // hard configuration — retry silently
      }
    }
  }

  self.postMessage({ type: 'done' });
};
