import { buildGeneratorConfig, DEFAULT_ADV_CFG } from '@/components/bingo/BingoAdvancedConfig';

/**
 * Generate puzzles in a Web Worker so the UI thread stays responsive.
 * Each puzzle posts back individually — the caller gets live progress.
 *
 * @param {object[]} cfgList   - Flat array of generateBingo configs (built in main thread)
 * @param {object}   handlers
 * @param {function} handlers.onEach  - (result, done, total) — called per puzzle
 * @param {function} handlers.onDone  - () — all done
 * @param {function} handlers.onError - (Error) — generator threw
 * @returns {function} cancel — terminates the worker immediately
 */
export function generateBatchAsync(cfgList, { onEach, onDone, onError }) {
  const worker = new Worker(
    new URL('./bingoWorker.js', import.meta.url),
    { type: 'module' }
  );

  worker.onmessage = ({ data }) => {
    if (data.type === 'result') {
      onEach?.(data.result, data.done, data.total);
    } else if (data.type === 'done') {
      worker.terminate();
      onDone?.();
    } else if (data.type === 'error') {
      worker.terminate();
      onError?.(new Error(data.message));
    }
  };

  worker.onerror = (e) => {
    worker.terminate();
    onError?.(new Error(e.message ?? 'Worker error'));
  };

  worker.postMessage({ type: 'generate', cfgList });

  return () => worker.terminate();
}

/**
 * Build a flat array of generator configs from puzzleSets.
 * Runs in the main thread — configs are plain objects, safe to postMessage.
 *
 * @param {object[]} puzzleSets
 * @param {string}   mode
 * @param {object[]} tileSetsCache  - [{ id, tiles }] from API, optional
 * @returns {object[]} cfgList
 */
export function buildCfgList(puzzleSets, mode, tileSetsCache = []) {
  const list = [];
  for (const s of puzzleSets) {
    const poolDef = s.tileSetId
      ? (tileSetsCache.find(ts => ts.id === s.tileSetId)?.tiles ?? null)
      : null;
    const cfg = buildGeneratorConfig(mode, s.tileCount, s.advancedCfg ?? DEFAULT_ADV_CFG, poolDef);
    for (let i = 0; i < s.count; i++) list.push(cfg);
  }
  return list;
}
