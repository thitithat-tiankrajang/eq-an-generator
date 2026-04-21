// ================================================================
//  dfsSolver.js
//  DFS-based equation finder + LRU cache layer.
//  Owns: findEquationsFromTiles, cache state, getDfsCacheStats.
// ================================================================

import { shuffle, isValidEquation, OPS_ALL } from './bingoMath.js';
import { HEAVY_LIST, LIGHT_DIGS } from './tileHelpers.js';

// ── Cache ─────────────────────────────────────────────────────────────────────

const DFS_CACHE_MAX = 800;
const _dfsCache = new Map();
let _dfsCacheHits = 0;
let _dfsInvocations = 0;

function canonicalTileKey(tileCounts) {
  return Object.entries(tileCounts)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
}

export function _dfsLookupOrRun(tileCounts, eqCount) {
  const key = canonicalTileKey(tileCounts);
  if (_dfsCache.has(key)) {
    _dfsCacheHits++;
    return _dfsCache.get(key);
  }

  _dfsInvocations++;
  const found = findEquationsFromTiles({ ...tileCounts }, eqCount, 1);

  if (_dfsCache.size >= DFS_CACHE_MAX) {
    const firstKey = _dfsCache.keys().next().value;
    _dfsCache.delete(firstKey);
  }
  _dfsCache.set(key, found);
  return found;
}

export function getDfsCacheStats() {
  return {
    cacheSize: _dfsCache.size,
    invocations: _dfsInvocations,
    hits: _dfsCacheHits,
    hitRate: _dfsInvocations > 0
      ? (_dfsCacheHits / (_dfsInvocations + _dfsCacheHits)).toFixed(3)
      : 'n/a',
  };
}

// ── DFS solver (preserved from v5) ───────────────────────────────────────────

export function findEquationsFromTiles(tileCounts, requiredEquals, maxResults = 1) {
  const results = [];
  const eqParts = [];
  const srcTiles = [];

  function rem() {
    let s = 0;
    for (const v of Object.values(tileCounts)) s += v;
    return s;
  }
  function take(t) { tileCounts[t]--; }
  function put(t)  { tileCounts[t]++; }

  function buildNum(onComplete, zeroOk) {
    if (results.length >= maxResults) return;

    for (const h of HEAVY_LIST) {
      if ((tileCounts[h] || 0) > 0) {
        take(h);
        eqParts.push(h); srcTiles.push(h);
        onComplete();
        eqParts.pop(); srcTiles.pop();
        put(h);
        if (results.length >= maxResults) return;
      }
    }

    if ((tileCounts['?'] || 0) > 0) {
      for (const h of ['10', '12']) {
        take('?');
        eqParts.push(h); srcTiles.push('?');
        onComplete();
        eqParts.pop(); srcTiles.pop();
        put('?');
        if (results.length >= maxResults) return;
      }
    }

    if (zeroOk) {
      for (const src of ['0', '?']) {
        if ((tileCounts[src] || 0) > 0) {
          take(src);
          eqParts.push('0'); srcTiles.push(src);
          onComplete();
          eqParts.pop(); srcTiles.pop();
          put(src);
          if (results.length >= maxResults) return;
        }
      }
    }

    const digitOrder = shuffle(LIGHT_DIGS);

    function composeDigits(built, builtSrcs) {
      if (results.length >= maxResults) return;
      if (built.length > 0) {
        eqParts.push(built);
        srcTiles.push(...builtSrcs);
        onComplete();
        eqParts.pop();
        for (let i = 0; i < builtSrcs.length; i++) srcTiles.pop();
      }
      if (built.length >= 3) return;
      for (const d of digitOrder) {
        for (const src of [d, '?']) {
          if ((tileCounts[src] || 0) > 0) {
            take(src);
            composeDigits(built + d, [...builtSrcs, src]);
            put(src);
            if (results.length >= maxResults) return;
          }
        }
      }
    }
    composeDigits('', []);
  }

  function dfs(phase, usedEq) {
    if (results.length >= maxResults) return;

    if (rem() === 0) {
      if (phase === 'op' && usedEq === requiredEquals) {
        const eq = eqParts.join('');
        if (isValidEquation(eq, requiredEquals, !eq.includes('÷'))) {
          results.push({ eq, tiles: [...srcTiles] });
        }
      }
      return;
    }

    if (phase === 'num') {
      buildNum(() => dfs('op', usedEq), true);
      return;
    }

    if (usedEq < requiredEquals) {
      for (const src of ['=', '?']) {
        if ((tileCounts[src] || 0) > 0) {
          take(src);
          eqParts.push('='); srcTiles.push(src);
          dfs('num', usedEq + 1);
          eqParts.pop(); srcTiles.pop();
          put(src);
          if (results.length >= maxResults) return;
        }
      }
    }

    for (const op of shuffle(OPS_ALL)) {
      const srcs = [op];
      if (op === '+' || op === '-') srcs.push('+/-');
      if (op === '×' || op === '÷') srcs.push('×/÷');
      srcs.push('?');

      const tried = new Set();
      for (const src of srcs) {
        if (tried.has(src)) continue;
        tried.add(src);
        if ((tileCounts[src] || 0) > 0) {
          take(src);
          eqParts.push(op); srcTiles.push(src);
          dfs('num', usedEq);
          eqParts.pop(); srcTiles.pop();
          put(src);
          if (results.length >= maxResults) return;
        }
      }
    }
  }

  dfs('num', 0);
  return results;
}
