// ================================================================
//  equationMutator.js
//  Smart tile-count mutation and quick feasibility checks.
// ================================================================

import { toRange } from './bingoMath.js';
import {
  LIGHT_DIGS, OPS_SET, WILDS_SET,
  makeCounts, analyzeCounts, withinPoolLimits, satisfiesConfigFromCounts,
} from './tileHelpers.js';
import { POOL_DEF } from './equationConstructors.js';

// ── Smart mutation ────────────────────────────────────────────────────────────

export function mutateTileCountsSmart(tileCounts, cfg, eqCount, poolDef = POOL_DEF) {
  const counts = { ...tileCounts };
  const pool = makeCounts(poolDef);
  for (const [k, v] of Object.entries(counts)) pool[k] = (pool[k] || 0) - v;

  const canAdd  = (t) => (pool[t] || 0) > 0;
  const consume = (to, from) => {
    if ((counts[from] || 0) <= 0) return false;
    if (!canAdd(to)) return false;
    counts[from]--;
    if (counts[from] === 0) delete counts[from];
    counts[to] = (counts[to] || 0) + 1;
    pool[to]--;
    pool[from] = (pool[from] || 0) + 1;
    return true;
  };

  const blankRange = toRange(cfg.blankCount);
  const wildRange  = toRange(cfg.wildcardCount);
  const pmRange    = toRange(cfg.operatorSpec?.['+/-']);
  const mdRange    = toRange(cfg.operatorSpec?.['×/÷']);
  const targetPmMin = pmRange ? pmRange[0] : 0;
  const targetMdMin = mdRange ? mdRange[0] : 0;

  let guard = 0;
  while ((counts['+/-'] || 0) < targetPmMin && guard++ < 200) {
    const from = (counts['+'] || 0) > (counts['-'] || 0) ? '+' : '-';
    if (!consume('+/-', from)) {
      const alt = from === '+' ? '-' : '+';
      if (!consume('+/-', alt)) break;
    }
  }

  guard = 0;
  while ((counts['×/÷'] || 0) < targetMdMin && guard++ < 200) {
    const from = (counts['×'] || 0) > (counts['÷'] || 0) ? '×' : '÷';
    if (!consume('×/÷', from)) {
      const alt = from === '×' ? '÷' : '×';
      if (!consume('×/÷', alt)) break;
    }
  }

  const minBlank = blankRange ? blankRange[0] : 0;
  const maxBlank = blankRange ? blankRange[1] : Infinity;
  const minWild  = wildRange  ? wildRange[0]  : 0;
  const maxWild  = wildRange  ? wildRange[1]  : Infinity;

  guard = 0;
  while ((counts['?'] || 0) < minBlank && guard++ < 300) {
    if (!canAdd('?')) break;
    const lightCands = LIGHT_DIGS.filter(d => (counts[d] || 0) > 0);
    const otherCands = Object.keys(counts).filter(t =>
      !OPS_SET.has(t) && t !== '=' && t !== '?' && !LIGHT_DIGS.includes(t) && (counts[t] || 0) > 0
    );
    const candidates = lightCands.length > 0 ? lightCands : otherCands;
    if (!candidates.length) break;
    const from = candidates[0 | (Math.random() * candidates.length)];
    if (!consume('?', from)) break;
  }

  guard = 0;
  while (analyzeCounts(counts).wilds < minWild && guard++ < 400) {
    const blanks = counts['?'] || 0;
    if (blanks < maxBlank) {
      const lightCands = LIGHT_DIGS.filter(d => (counts[d] || 0) > 0);
      const otherCands = Object.keys(counts).filter(t =>
        !OPS_SET.has(t) && t !== '=' && t !== '?' && !LIGHT_DIGS.includes(t) && (counts[t] || 0) > 0
      );
      const candidates = lightCands.length > 0 ? lightCands : otherCands;
      if (candidates.length) {
        const from = candidates[0 | (Math.random() * candidates.length)];
        if (consume('?', from)) continue;
      }
    }
    if ((counts['+'] || 0) + (counts['-'] || 0) > 0 && canAdd('+/-')) {
      if (consume('+/-', (counts['+'] || 0) >= (counts['-'] || 0) ? '+' : '-')) continue;
      if (consume('+/-', '+') || consume('+/-', '-')) continue;
    }
    if ((counts['×'] || 0) + (counts['÷'] || 0) > 0 && canAdd('×/÷')) {
      if (consume('×/÷', (counts['×'] || 0) >= (counts['÷'] || 0) ? '×' : '÷')) continue;
      if (consume('×/÷', '×') || consume('×/÷', '÷')) continue;
    }
    break;
  }

  const a = analyzeCounts(counts);
  if (a.blanks > maxBlank || a.wilds > maxWild) return null;
  if (!withinPoolLimits(counts, poolDef)) return null;
  if (!satisfiesConfigFromCounts(counts, cfg, eqCount)) return null;
  return counts;
}

// ── Quick feasibility checks ──────────────────────────────────────────────────

export function quickChecks(tileCounts, cfg, eqCount) {
  const a = analyzeCounts(tileCounts);

  if (a.equals !== eqCount) return false;

  const realNumCount = Object.entries(tileCounts).reduce((s, [t, v]) => {
    if (OPS_SET.has(t) || t === '=' || WILDS_SET.has(t)) return s;
    return s + v;
  }, 0);
  if (realNumCount < 2) return false;

  const opRange = toRange(cfg.operatorCount);
  if (opRange && (a.ops < opRange[0] || a.ops > opRange[1])) return false;

  const heavyRange = toRange(cfg.heavyCount);
  if (heavyRange && (a.heavy < heavyRange[0] || a.heavy > heavyRange[1])) return false;

  return true;
}
